# OpenAI Integration

The Iris CLI now supports OpenAI's GPT models as an alternative provider, giving you access to the full OpenAI model family while retaining all the powerful CLI tools and features.

## Quick Start

1. **Get an OpenAI API Key**
   - Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
   - Create a new API key
   - Copy the key (starts with `sk-`)

2. **Set Environment Variable**
   ```bash
   export OPENAI_API_KEY="sk-your-key-here"
   ```

3. **Start the CLI**
   ```bash
   gemini
   ```
   
4. **Select OpenAI Provider**
   - When prompted for authentication, select "Use OpenAI API Key"
   - The CLI will automatically detect your API key

## Supported Models

| Model | Description | Best For |
|-------|-------------|----------|
| `gpt-4o` (default) | Latest GPT-4 Optimized | General purpose, complex reasoning |
| `gpt-4o-mini` | Smaller, faster GPT-4 | Quick tasks, cost optimization |
| `o1-preview` | Reasoning-focused model | Complex problem solving |
| `o1-mini` | Smaller reasoning model | Mathematical and coding problems |

## Feature Compatibility

✅ **Fully Supported:**
- Function calling (all existing tools work)
- Streaming responses
- Multi-turn conversations
- File operations
- Shell commands
- Web search and fetch
- MCP server integration

📊 **Estimated Features:**
- Token counting (uses character-based estimation)

🔄 **Provider-Specific:**
- Embeddings (uses OpenAI's text-embedding models)
- Model-specific parameters

## Configuration

### Default Provider
Set OpenAI as your default provider:
```bash
export GEMINI_DEFAULT_AUTH_TYPE="openai-api-key"
```

### Model Selection
The CLI automatically uses `gpt-4o` by default. To use a different model, you can configure it through the standard CLI model selection methods.

### Cost Optimization
- Use `gpt-4o-mini` for simpler tasks
- OpenAI pricing is token-based, so shorter conversations cost less
- The CLI provides token usage information after each interaction

## Advanced Usage

### Using with Custom Endpoints
If you're using OpenAI-compatible endpoints (like Azure OpenAI), you can modify the base URL in the provider configuration.

### Switching Between Providers
You can easily switch between Gemini and OpenAI providers:
- Use `/auth` command in the CLI
- Set different environment variables
- All your tools and configurations remain the same

## Troubleshooting

### Common Issues

**"OpenAI API key is required"**
- Ensure `OPENAI_API_KEY` is set in your environment
- Check that the key starts with `sk-`
- Verify the key is valid by testing it with OpenAI directly

**"Invalid model" errors**
- Check that you're using a supported model name
- Some models may require higher API tier access

**Rate limiting**
- OpenAI has rate limits based on your API tier
- Free tier has lower limits than paid tiers
- Consider upgrading your OpenAI plan for higher limits

### Getting Help

If you encounter issues:
1. Check the main [troubleshooting guide](./troubleshooting.md)
2. Verify your OpenAI API key works with other tools
3. Report issues on GitHub with provider-specific labels

## Implementation Details

### Architecture
The OpenAI integration uses a provider pattern that maps OpenAI API calls to the standard Iris CLI interface. This ensures:
- Consistent behavior across providers  
- All existing tools work without modification
- Easy switching between providers
- Future provider additions follow the same pattern

### API Mapping
- OpenAI Chat Completions → Gemini GenerateContent
- OpenAI Function Calling → Gemini Tools
- OpenAI Streaming → Gemini Streaming
- OpenAI Embeddings → Gemini Embeddings

### Performance
The OpenAI provider includes optimizations for:
- Efficient message conversion
- Streaming response handling
- Tool call management
- Error handling and recovery