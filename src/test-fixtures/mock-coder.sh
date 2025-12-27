#!/bin/bash
# Mock Terminal Coder - Simulates a terminal AI coder CLI for testing
#
# Usage:
#   echo "prompt" | ./mock-coder.sh                    # stdin input
#   ./mock-coder.sh "prompt"                           # positional input
#   ./mock-coder.sh -p "prompt"                        # flag input
#   ./mock-coder.sh --prompt "prompt"                  # long flag input
#
# Options:
#   -o, --output <format>   Output format: text, json, jsonl (default: text)
#   -s, --stream            Enable streaming output
#   -d, --delay <ms>        Delay between stream chunks (default: 100)
#   --error <type>          Simulate error: rate_limit, auth, timeout, unknown
#   --exit-code <n>         Exit with specific code
#   -h, --help              Show help

set -e

# Defaults
OUTPUT_FORMAT="text"
STREAMING=false
DELAY_MS=100
ERROR_TYPE=""
EXIT_CODE=0
PROMPT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -p | --prompt)
      PROMPT="$2"
      shift 2
      ;;
    -o | --output)
      OUTPUT_FORMAT="$2"
      shift 2
      ;;
    -s | --stream)
      STREAMING=true
      shift
      ;;
    -d | --delay)
      DELAY_MS="$2"
      shift 2
      ;;
    --error)
      ERROR_TYPE="$2"
      shift 2
      ;;
    --exit-code)
      EXIT_CODE="$2"
      shift 2
      ;;
    -h | --help)
      echo "Mock Terminal Coder - For testing adapter wrappers"
      echo ""
      echo "Usage: mock-coder.sh [options] [prompt]"
      echo ""
      echo "Options:"
      echo "  -p, --prompt <text>   Prompt text"
      echo "  -o, --output <fmt>    Output format: text, json, jsonl"
      echo "  -s, --stream          Enable streaming"
      echo "  -d, --delay <ms>      Stream delay (default: 100)"
      echo "  --error <type>        Simulate error: rate_limit, auth, timeout"
      echo "  --exit-code <n>       Exit with code"
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      # Positional argument = prompt
      PROMPT="$1"
      shift
      ;;
  esac
done

# Read from stdin if no prompt given
if [[ -z "$PROMPT" ]]; then
  if [[ ! -t 0 ]]; then
    PROMPT=$(cat)
  fi
fi

if [[ -z "$PROMPT" ]]; then
  echo "Error: No prompt provided" >&2
  exit 1
fi

# Handle error simulation
if [[ -n "$ERROR_TYPE" ]]; then
  case $ERROR_TYPE in
    rate_limit)
      echo "Error 429: Rate limit exceeded. Please try again later." >&2
      exit 1
      ;;
    auth)
      echo "Error 401: Unauthorized. Invalid API key." >&2
      exit 1
      ;;
    timeout)
      echo "Error: Request timed out after 30 seconds." >&2
      exit 1
      ;;
    context_length)
      echo "Error: Context length exceeded. Maximum is 8192 tokens." >&2
      exit 1
      ;;
    *)
      echo "Error: Unknown error occurred." >&2
      exit 1
      ;;
  esac
fi

# Generate response based on prompt
generate_response() {
  local prompt="$1"

  # Simple echo-back with mock "AI" response
  # Note: Order matters! Check more specific patterns first
  if [[ "$prompt" == *"hello"* ]] || [[ "$prompt" == *"Hello"* ]]; then
    echo "Hello! I'm Mock Coder, a simulated AI assistant for testing."
  elif [[ "$prompt" == *"explain"* ]]; then
    # Check explain before code since "explain this code" contains both
    echo "This code does the following:"
    echo "1. Takes an input parameter"
    echo "2. Processes it through the algorithm"
    echo "3. Returns the computed result"
  elif [[ "$prompt" == *"code"* ]] || [[ "$prompt" == *"function"* ]]; then
    echo "Here's a sample function:"
    echo ""
    echo "function greet(name) {"
    echo "  return \`Hello, \${name}!\`;"
    echo "}"
  else
    echo "I received your prompt: \"$prompt\""
    echo "Here is my response as Mock Coder."
  fi
}

# Output based on format
RESPONSE=$(generate_response "$PROMPT")

delay_seconds=$(echo "scale=3; $DELAY_MS / 1000" | bc 2>/dev/null || echo "0.1")

case $OUTPUT_FORMAT in
  json)
    if $STREAMING; then
      # Stream JSON chunks
      words=($RESPONSE)
      accumulated=""
      for word in "${words[@]}"; do
        accumulated="$accumulated $word"
        echo "{\"type\":\"chunk\",\"text\":\"$word \"}"
        sleep "$delay_seconds"
      done
      echo "{\"type\":\"complete\",\"text\":\"$accumulated\"}"
    else
      # Single JSON response
      escaped_response=$(echo "$RESPONSE" | sed 's/"/\\"/g' | tr '\n' ' ')
      echo "{\"text\":\"$escaped_response\",\"usage\":{\"inputTokens\":$(echo -n "$PROMPT" | wc -w),\"outputTokens\":$(echo -n "$RESPONSE" | wc -w)}}"
    fi
    ;;
  jsonl)
    if $STREAMING; then
      # Stream JSONL (one object per line)
      words=($RESPONSE)
      for word in "${words[@]}"; do
        echo "{\"chunk\":\"$word \"}"
        sleep "$delay_seconds"
      done
      echo "{\"done\":true}"
    else
      echo "{\"response\":\"$RESPONSE\"}"
    fi
    ;;
  text | *)
    if $STREAMING; then
      # Stream text line by line
      echo "$RESPONSE" | while IFS= read -r line || [[ -n "$line" ]]; do
        echo "$line"
        sleep "$delay_seconds"
      done
    else
      echo "$RESPONSE"
    fi
    ;;
esac

exit $EXIT_CODE
