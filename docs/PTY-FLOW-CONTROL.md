# Bounded PTY transport and session lifecycle

The PTY reader retains its bounded queue (256 chunks of up to 8 KiB).
Delivery now also limits bytes that have crossed IPC but have not yet been
parsed by xterm. Per session, the high watermark is 256 KiB; after hitting it,
delivery waits until outstanding bytes fall to 64 KiB or below. IPC packets
are at most 64 KiB. The queue, grouping buffer, native pipe, xterm scrollback,
and runtime caches are separate allocations: 256 KiB is not total session RAM.

The frontend supplies an acknowledgement callback to `term.write(bytes, cb)`.
Only that parser callback returns credit. Adjacent acknowledgements are combined
within a microtask. Raw byte delivery preserves UTF-8 sequences split between
packets. Each spawn has a fresh token; callbacks from an older session cannot
grant credit to a replacement using the same ID. Excess acknowledgements are
rejected rather than underflowing the counter.

Closing a session wakes both the delivery queue and credit waits. A failed
channel send closes flow control and terminates the child. Idle delivery blocks
on a channel; there is no periodic wakeup to check whether a session closed.

## Exit and cancellation

On normal exit, the child waiter closes the master PTY on a separate thread
while the reader drains the final output. ConPTY needs this shutdown to signal
EOF even after its child has exited. The emitter waits for all parser credits
before sending the exit notification. Explicit close cancels those waits and
may discard pending output, allowing immediate user cancellation.

Closing the pseudoconsole on the reader/UI thread can deadlock on older Windows
versions. The implementation keeps that operation on the child-waiter thread.
See [Microsoft's ClosePseudoConsole contract](https://learn.microsoft.com/en-us/windows/console/closepseudoconsole).

The registry reserves an ID before spawning and publishes a session only if
its slot has not been cancelled. Cleanup checks slot identity, so an old failed
spawn cannot delete a replacement. Registry lookup locks are released before
write, resize, kill, or handle disposal. Native PTY commands use the blocking
worker pool; each session owns separate writer/master locks.

## Input and resize

The frontend installs its input handlers before startup output arrives, including
DSR requests. Input waits until spawn has completed and is serialized per session
to preserve order across worker threads. Queued input is limited to 128 requests
and 1,048,576 UTF-16 code units (approximately 2 MiB of string content). Oversized
paste input is rejected with a visible input-queue error; already submitted input
cannot be retracted. A blocked write does not prevent a separate close command.

Resizes wait for startup, run one at a time, and coalesce intermediate requests
to the latest size. A final resize after spawn reconciles layout changes during
startup. Explicit close clears frontend queues and suppresses late channel/parser
callbacks.

## Verification boundaries

Tests cover delayed parser credits, closing without acknowledgements, stale
tokens, duplicate/reserved IDs, cancellation and ID reuse, independent sessions
under a blocked writer, disconnected sinks, startup input, resize coalescing,
and fragmented byte delivery. The native Windows PTY test delivers 25,000
Unicode markers with all accented/CJK/emoji glyphs and no replacement characters,
and checks that exit follows the final acknowledgement.

These tests exercise the real native PTY and a simulated parser/IPC peer, plus
mocked frontend Tauri channels. They do not replace a packaged app UI smoke test,
Linux/macOS native validation, or before/after CPU/RAM measurements.
