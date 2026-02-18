# Security Notice - Database Credentials

⚠️ **IMPORTANT**: This MCP server project contains sensitive database credentials.

## Files with Sensitive Data

**NEVER commit these files to version control:**
- `.env.local` - Contains actual Neon database URLs with credentials
- `C:\Users\Stench\AppData\Roaming\Claude\claude_desktop_config.json` - Contains database URLs in env section

## Safe Files

These files are safe and contain only environment variable references:
- `prisma/schema.prisma` - Uses `env("DATABASE_URL")` references only
- All TypeScript source files - No hardcoded credentials

## Production Security Recommendations

1. **Rotate credentials** if this repository is ever made public
2. **Use separate databases** for development/production environments  
3. **Set up secret management** for production deployments
4. **Enable database access logs** in Neon to monitor connections

## For Team Members

If sharing this project:
1. Share the codebase WITHOUT the `.env.local` file
2. Provide database URLs through secure channels (encrypted chat, password managers)
3. Each developer should create their own `.env.local` file locally
