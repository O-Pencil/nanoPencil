# Debug Logging

nanoPencil includes a debug logging system to help troubleshoot issues with AI providers, especially for non-standard providers like dashscope-coding.

## Quick Start

Enable debug logging by setting an environment variable:

```bash
# Enable debug logging
export NANOPENCIL_DEBUG=1

# Or use the legacy name
export PI_DEBUG=1

# Run nanopencil
nanopencil
```

## Log Levels

Control the verbosity with `NANOPENCIL_DEBUG_LEVEL`:

```bash
export NANOPENCIL_DEBUG_LEVEL=trace  # Most verbose
export NANOPENCIL_DEBUG_LEVEL=debug
export NANOPENCIL_DEBUG_LEVEL=info   # Default
export NANOPENCIL_DEBUG_LEVEL=warn
export NANOPENCIL_DEBUG_LEVEL=error  # Least verbose
```

## Log File Location

Debug logs are written to:
- `~/.nanopencil/agent/nanopencil-debug.log`

View the log:
```bash
tail -f ~/.nanopencil/agent/nanopencil-debug.log
```

## What Gets Logged

When debug logging is enabled, the following information is captured:

### AI Provider Requests
- Full request parameters sent to the AI provider
- Model name, provider, messages, tools, etc.

### AI Provider Responses
- Each streaming chunk received from the provider
- Parsed content deltas
- Tool calls and reasoning content

### Content Parsing
- How content is being processed and transformed
- Thinking tag extraction (for MiniMax-style reasoning)

### TUI Events (trace level)
- Rendering operations
- Component updates

## Example Log Output

```
[2025-01-15T10:30:45.123Z] [DEBUG] [AI] Request to dashscope-coding/kimi-k2.5
{
  "model": "kimi-k2.5",
  "messages": [...],
  "stream": true
}

[2025-01-15T10:30:45.456Z] [TRACE] [AI] Chunk from dashscope-coding/kimi-k2.5
{
  "choices": [{
    "delta": {
      "content": "Hello, "
    }
  }]
}

[2025-01-15T10:30:45.789Z] [TRACE] [PARSE] choice.delta
{
  "input": {
    "content": "Hello, ",
    "tool_calls": undefined,
    "reasoning_content": undefined
  }
}
```

## Troubleshooting dashscope-coding

If you're experiencing issues with dashscope-coding (content not showing, truncated responses, etc.), enable debug logging and:

1. Run a simple prompt
2. Check the log file for:
   - Are chunks being received? (Look for `[TRACE] [AI] Chunk`)
   - Is content in the expected format? (Check `choice.delta.content`)
   - Are there any error responses?

3. Compare with a working provider (like OpenAI) to see the difference in response format.

## Clearing Logs

The log file is automatically rotated when it exceeds 10MB. To manually clear:

```bash
# Clear the current log
> ~/.nanopencil/agent/nanopencil-debug.log

# Or remove the backup
rm ~/.nanopencil/agent/nanopencil-debug.log.old
```

## Performance Impact

Debug logging has minimal performance impact when disabled. When enabled:
- Trace level: May slow down streaming responses due to frequent disk writes
- Debug/Info level: Minimal impact

Only enable when troubleshooting issues.

## API for Extension Developers

Extensions can also use the debug logger:

```typescript
import { getDebugLogger } from "@pencil-agent/nano-pencil/core";

const logger = getDebugLogger();

// Log at different levels
logger.error("MyExtension", "Something went wrong", error);
logger.warn("MyExtension", "Warning message");
logger.info("MyExtension", "Info message");
logger.debug("MyExtension", "Debug data", { some: "data" });
logger.trace("MyExtension", "Trace details");
```

Or use the convenience exports:

```typescript
import { debug } from "@pencil-agent/nano-pencil/core";

debug.info("MyExtension", "Message");
debug.debug("MyExtension", "Data", { key: "value" });
```
