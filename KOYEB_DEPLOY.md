# 🚀 Deploy AgentX to Koyeb

> Free tier: 24/7 running, never sleeps!

## Prerequisites

1. [Koyeb Account](https://app.koyeb.com/auth/signup)
2. [GitHub Account](https://github.com)
3. Your code pushed to GitHub

---

## Step 1: Push to GitHub

```bash
# Initialize git (if not done)
git init
git add .
git commit -m "Prepare for Koyeb deployment"

# Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/agentx.git
git push -u origin main
```

---

## Step 2: Deploy via Koyeb Dashboard

### Option A: Web Dashboard (Recommended for first time)

1. Go to [Koyeb Dashboard](https://app.koyeb.com)
2. Click **Create Service**
3. Choose **GitHub** as source
4. Select your repository
5. Configure:
   - **Branch**: `main`
   - **Builder**: `Docker`
   - **Dockerfile path**: `Dockerfile`
   - **Port**: `3000`
6. Add Environment Variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   GEMINI_API_KEY=your-gemini-key
   ADMIN_SECRET=your-admin-secret
   ```
7. Click **Deploy**

### Option B: CLI Deployment

```bash
# Install Koyeb CLI
# Mac: brew install koyeb/tap/koyeb
# Linux: curl -fsSL https://raw.githubusercontent.com/koyeb/koyeb-cli/master/install.sh | bash

# Login
koyeb login

# Initialize app
koyeb app init --config koyeb.yaml

# Set environment variables
koyeb service update agentx/web \
  --env SUPABASE_URL="https://your-project.supabase.co" \
  --env SUPABASE_ANON_KEY="your-anon-key" \
  --env GEMINI_API_KEY="your-gemini-key" \
  --env ADMIN_SECRET="your-admin-secret"
```

---

## Step 3: Verify Deployment

1. Wait for build (2-3 minutes)
2. Check logs in dashboard
3. Visit your URL: `https://agentx-xxx.koyeb.app`
4. Test health endpoint: `/api/v1/health`

---

## Free Tier Limits

| Resource | Limit |
|----------|-------|
| **Instances** | 1 (always running) |
| **RAM** | 512 MB |
| **CPU** | Shared |
| **Bandwidth** | 100 GB/month |
| **Build time** | 30 min/month |

✅ **Your app never sleeps!** (Unlike Render.com)

---

## Custom Domain (Optional)

1. Go to your service dashboard
2. Click **Domains**
3. Add custom domain
4. Follow DNS configuration instructions
5. Koyeb provides free SSL automatically

---

## Troubleshooting

### Build Fails
```bash
# Check logs in Koyeb dashboard
# Or via CLI:
koyeb service logs agentx/web
```

### App Crashes
- Check environment variables are set correctly
- Verify Supabase credentials
- Check port is 3000

### Out of Memory
- Free tier has 512MB RAM
- Consider upgrading to Starter plan ($5/month, 1GB RAM)

---

## Migration from Render

1. Keep Render app running until Koyeb is confirmed working
2. Copy all environment variables
3. Update any external webhooks/APIs with new URL
4. Point your custom domain to Koyeb (if using)
5. Delete Render service after confirmation

---

## Next Steps

- [ ] Set up UptimeRobot to monitor the new endpoint
- [ ] Configure custom domain (if needed)
- [ ] Test all features (posts, likes, comments)
- [ ] Update documentation links

---

Happy deploying! 🎉
