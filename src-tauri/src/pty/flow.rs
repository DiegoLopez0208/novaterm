use std::sync::{Condvar, Mutex};

pub const HIGH_WATERMARK: usize = 256 * 1024;
const LOW_WATERMARK: usize = 64 * 1024;

#[derive(Default)]
struct State {
    pending: usize,
    closed: bool,
}

/** Credits cover bytes sent over IPC until xterm has parsed them. */
#[derive(Default)]
pub struct FlowControl {
    state: Mutex<State>,
    changed: Condvar,
    wake_delivery: Mutex<Option<Box<dyn Fn() + Send + Sync>>>,
}

impl FlowControl {
    pub fn reserve(&self, bytes: usize) -> bool {
        if bytes > HIGH_WATERMARK {
            return false;
        }
        let mut state = self.state.lock().unwrap_or_else(|err| err.into_inner());
        if state.pending + bytes > HIGH_WATERMARK {
            while !state.closed
                && (state.pending > LOW_WATERMARK || state.pending + bytes > HIGH_WATERMARK)
            {
                state = self
                    .changed
                    .wait(state)
                    .unwrap_or_else(|err| err.into_inner());
            }
        }
        if state.closed {
            return false;
        }
        state.pending += bytes;
        true
    }

    pub fn acknowledge(&self, bytes: usize) -> Result<(), String> {
        let mut state = self.state.lock().unwrap_or_else(|err| err.into_inner());
        if state.closed {
            return Ok(());
        }
        if bytes > state.pending {
            return Err("PTY acknowledgement exceeds outstanding bytes".into());
        }
        state.pending -= bytes;
        self.changed.notify_all();
        Ok(())
    }

    pub fn wait_until_drained(&self) -> bool {
        let mut state = self.state.lock().unwrap_or_else(|err| err.into_inner());
        while !state.closed && state.pending != 0 {
            state = self
                .changed
                .wait(state)
                .unwrap_or_else(|err| err.into_inner());
        }
        !state.closed
    }

    pub fn close(&self) {
        self.state
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .closed = true;
        self.changed.notify_all();
        if let Some(wake) = self
            .wake_delivery
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .as_ref()
        {
            wake();
        }
    }

    pub fn set_waker(&self, wake: impl Fn() + Send + Sync + 'static) {
        let mut current = self
            .wake_delivery
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        *current = Some(Box::new(wake));
        if self.is_closed() {
            current.as_ref().unwrap()();
        }
    }

    pub fn clear_waker(&self) {
        self.wake_delivery
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .take();
    }

    pub fn is_closed(&self) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .closed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    use std::time::Duration;

    #[test]
    fn slow_parser_blocks_delivery_until_low_watermark() {
        let flow = Arc::new(FlowControl::default());
        assert!(flow.reserve(HIGH_WATERMARK));
        let (sent, received) = mpsc::channel();
        let waiting = flow.clone();
        let sender = std::thread::spawn(move || {
            sent.send(waiting.reserve(8192)).unwrap();
        });
        assert!(received.recv_timeout(Duration::from_millis(50)).is_err());
        flow.acknowledge(8192).unwrap();
        assert!(received.recv_timeout(Duration::from_millis(50)).is_err());
        flow.acknowledge(HIGH_WATERMARK - LOW_WATERMARK - 8192)
            .unwrap();
        assert!(received.recv_timeout(Duration::from_secs(1)).unwrap());
        sender.join().unwrap();
    }

    #[test]
    fn close_wakes_a_blocked_sender_and_a_drain_waiter() {
        let flow = Arc::new(FlowControl::default());
        assert!(flow.reserve(HIGH_WATERMARK));
        let (sent, received) = mpsc::channel();
        let sender_flow = flow.clone();
        let waiter_flow = flow.clone();
        let first = sent.clone();
        let sender = std::thread::spawn(move || {
            first.send(sender_flow.reserve(1)).unwrap();
        });
        let waiter = std::thread::spawn(move || {
            sent.send(waiter_flow.wait_until_drained()).unwrap();
        });
        flow.close();
        assert!(!received.recv_timeout(Duration::from_secs(1)).unwrap());
        assert!(!received.recv_timeout(Duration::from_secs(1)).unwrap());
        sender.join().unwrap();
        waiter.join().unwrap();
    }

    #[test]
    fn acknowledgements_cannot_create_unearned_credit() {
        let flow = FlowControl::default();
        assert!(flow.reserve(100));
        assert!(flow.acknowledge(101).is_err());
        flow.acknowledge(100).unwrap();
        assert!(flow.wait_until_drained());
        assert!(!flow.reserve(HIGH_WATERMARK + 1));
        flow.close();
        assert!(!flow.reserve(1));
        assert!(flow.acknowledge(500).is_ok());
    }
}
