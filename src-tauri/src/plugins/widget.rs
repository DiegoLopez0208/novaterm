use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::sync::Semaphore;

use super::WidgetPlugin;

const TIMEOUT: Duration = Duration::from_secs(5);
const OUTPUT_LIMIT: usize = 64 * 1024;
static WIDGET_SLOTS: Semaphore = Semaphore::const_new(2);

/** Run outside the UI thread, without an unbounded queue of waiting requests. */
pub async fn ejecutar_widget(widget: &WidgetPlugin, cwd: Option<&str>) -> Result<String, String> {
    let _permit = WIDGET_SLOTS
        .try_acquire()
        .map_err(|_| "Widget concurrency limit reached".to_string())?;
    execute_with_limits(widget, cwd, TIMEOUT, OUTPUT_LIMIT).await
}

async fn read_bounded(stream: impl AsyncRead + Unpin, limit: usize) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    stream
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|err| err.to_string())?;
    if bytes.len() > limit {
        return Err(format!("Widget output exceeds {limit} bytes per stream"));
    }
    Ok(bytes)
}

async fn execute_with_limits(
    widget: &WidgetPlugin,
    cwd: Option<&str>,
    timeout: Duration,
    output_limit: usize,
) -> Result<String, String> {
    let mut command = Command::new(&widget.command);
    command
        .args(&widget.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if widget.usar_cwd {
        if let Some(directory) = cwd.filter(|dir| Path::new(dir).is_dir()) {
            command.current_dir(directory);
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let mut child = command.spawn().map_err(|err| err.to_string())?;
    let stdout = child.stdout.take().ok_or("Widget stdout is unavailable")?;
    let stderr = child.stderr.take().ok_or("Widget stderr is unavailable")?;

    // Drain both pipes concurrently, including while waiting for the child.
    // Dropping these futures on a deadline closes the pipes without leaked
    // blocking reader threads, even if a descendant inherited a pipe handle.
    let result = tokio::time::timeout(timeout, async {
        tokio::try_join!(
            async { child.wait().await.map_err(|err| err.to_string()) },
            read_bounded(stdout, output_limit),
            read_bounded(stderr, output_limit),
        )
    })
    .await;

    let output = match result {
        Ok(Ok((status, stdout, _stderr))) => {
            if !status.success() {
                return Err(format!("Widget exited with {status}"));
            }
            stdout
        }
        failed => {
            // kill() also reaps the direct child. Detached descendant process
            // containment is a separate platform-specific follow-up.
            let _ = tokio::time::timeout(Duration::from_secs(1), child.kill()).await;
            return Err(match failed {
                Err(_) => "Widget execution timed out".to_string(),
                Ok(Err(error)) => error,
                _ => unreachable!(),
            });
        }
    };
    let text = String::from_utf8_lossy(&output)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    Ok(if text.is_empty() {
        String::new()
    } else {
        format!("{}{text}", widget.prefijo)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn worker(mode: &str) -> WidgetPlugin {
        WidgetPlugin {
            id: "test-worker".into(),
            command: std::env::current_exe()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            args: vec![
                "--exact".into(),
                "plugins::widget::tests::subprocess_worker".into(),
                "--ignored".into(),
                "--nocapture".into(),
                mode.into(),
            ],
            intervalo_ms: 1000,
            prefijo: String::new(),
            usar_cwd: false,
        }
    }

    #[test]
    #[ignore = "subprocess fixture; invoked by bounded execution tests"]
    fn subprocess_worker() {
        let args: Vec<String> = std::env::args().collect();
        if args.iter().any(|arg| arg == "slow") {
            std::thread::sleep(Duration::from_secs(10));
        } else if args.iter().any(|arg| arg == "noisy-stderr") {
            eprint!("{}", "x".repeat(128 * 1024));
        } else {
            print!("{}", "x".repeat(128 * 1024));
        }
    }

    #[test]
    fn slow_widget_times_out() {
        let started = std::time::Instant::now();
        let result = tauri::async_runtime::block_on(execute_with_limits(
            &worker("slow"),
            None,
            Duration::from_millis(250),
            OUTPUT_LIMIT,
        ));
        assert!(result.unwrap_err().contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn stdout_and_stderr_have_enforced_limits() {
        for mode in ["noisy-stdout", "noisy-stderr"] {
            let result = tauri::async_runtime::block_on(execute_with_limits(
                &worker(mode),
                None,
                Duration::from_secs(5),
                OUTPUT_LIMIT,
            ));
            assert!(result.unwrap_err().contains("output exceeds"));
        }
    }
}
