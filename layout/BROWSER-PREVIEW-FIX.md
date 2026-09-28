# CodeForge Enhanced — Browser Preview Fix Guide

## 🔧 Solving Integrated Browser Preview Issues

If you're seeing errors like:
- ❌ "localhost refused to connect"
- ❌ "Enable Storage Partitioning"
- ❌ "CORS policy: No 'Access-Control-Allow-Origin' header"
- ❌ "Editor engine from vendor/vs" error

**This guide will fix them all!**

---

## 🎯 The Problem

When running CodeForge Enhanced with integrated browser preview, you may encounter:

1. **CORS Errors** — "blocked by CORS policy"
2. **Web Container Issues** — Storage partitioning required
3. **Service Worker Blocking** — Preview loads but shows blank
4. **Vite Client Issues** — `@vite/client` not found

**Root Causes:**
- Preview running in isolated context
- Cross-origin requests blocked
- Service Worker limitations
- Web container requirements

---

## ✅ Solution (v7.1 Fix)

### What's Fixed

**New files added:**
- `server/cors-config.js` — CORS header management
- `server/browser-preview-handler.js` — Browser preview handler
- Updates to `server.js` — Integration

**Key improvements:**
- ✅ CORS headers on all responses
- ✅ Proper web container headers
- ✅ Preflight request handling
- ✅ Vendor file proxying
- ✅ Safe iframe wrapping

---

## 🚀 Using the Fixed Version

### 1. Extract Updated ZIP
```bash
unzip CodeForge-Enhanced.zip
cd CodeForge-Enhanced
npm install
npm run serve
```

### 2. For Local Preview (Recommended)

**Option A: Use Terminal Preview**
```bash
# In CodeForge terminal:
npm start
# Browser automatically opens preview at http://localhost:3000
# No CORS issues!
```

**Option B: Open in New Window**
1. Terminal shows: `Dev server at http://localhost:3000`
2. Click link or copy-paste URL
3. Opens in separate browser window
4. Full functionality, no CORS

### 3. For Integrated Preview (Fixed)

The integrated preview now:
- ✅ Works with proper CORS headers
- ✅ Handles web container requirements
- ✅ Proxies vendor files correctly
- ✅ Shows live updates

---

## 🔍 Troubleshooting by Error

### Error: "localhost refused to connect"

**Cause:** Server not running

**Fix:**
```bash
# Terminal: check server is running
npm start

# Or run manually:
node server.js
```

### Error: "Enable Storage Partitioning"

**Cause:** Browser requires storage partitioning for web containers

**Fix Option 1: Browser Setting**
- Chrome: Skip this for now
- Firefox: Go to about:config
  - Set `dom.storageManager.enabled = true`

**Fix Option 2: Use Separate Window** (Recommended)
- Click preview link to open in new tab
- No partitioning needed
- Full functionality

**Fix Option 3: Use Different Browser**
- Safari: Works without issue
- Firefox: No restriction needed

### Error: "CORS policy: No 'Access-Control-Allow-Origin'"

**Cause:** Older version without CORS fix

**Fix:** Update to latest version with:
- `server/cors-config.js`
- Updated `server.js`

### Error: "couldn't load the editor engine from vendor/vs"

**Cause:** Editor files served without proper headers

**Fix:**
```bash
# Check vendor files exist:
ls public/vendor/vs/

# Restart server:
npm run serve
```

---

## 📋 Browser-Specific Setup

### Chrome/Chromium
✅ Works best  
✅ Storage Partitioning ready  
⚠️ May require explicit opt-in for web containers

```javascript
// In Chrome DevTools Console:
// If you see partitioning warning, try:
// Settings → More tools → Developer settings → 
// Check "Enable local overrides"
```

### Firefox
✅ Works well  
✅ No storage partitioning restrictions  
⚠️ May need slight configuration

```javascript
// about:config settings:
// dom.storageManager.enabled = true
// network.cookie.cookieBehavior = 0
```

### Safari
✅ Best experience  
✅ No CORS restrictions  
✅ Works out of the box  
⚠️ Some WebContainer features limited

### Edge
✅ Same as Chrome  
✅ Works well  
⚠️ Storage settings apply

---

## 🛠️ Manual Configuration (if needed)

### server.js CORS Setup

The server now automatically adds:

```javascript
// ✅ These headers are set automatically:
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");
res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
```

**No manual configuration needed!**

### Custom Port Setup

```bash
# If port 5500 is busy:
PORT=8000 npm run serve

# If preview port 3000 is busy:
PORT=8000 npm start  # Express server uses PORT env var
```

---

## 🔄 Recommended Workflow

### For Development (Best Experience)

```
CodeForge Terminal
↓
npm start
↓
Click preview link in terminal
↓
Opens http://localhost:3000 in NEW TAB
↓
Full functionality, zero CORS issues
↓
Edit files → See live reload
```

### For Testing (Integrated Preview)

```
CodeForge Integrated Preview
↓
Shows http://localhost:3000
↓
May show "Enable Storage Partitioning"
↓
Click "Open Preview" button
↓
Or manually open in browser tab
```

---

## 🎓 Understanding the Fix

### What Changed

**Before (v7.0):**
- CORS headers only on API endpoints
- Web container headers missing
- Vendor files not proxied
- Preview context isolated

**After (v7.1+):**
- ✅ CORS headers on ALL responses
- ✅ Proper web container headers
- ✅ Vendor file proxying
- ✅ Safe iframe communication

### How It Works

```
Request → Server
   ↓
Add CORS Headers
   ↓
Handle OPTIONS preflights
   ↓
Proxy vendor files if needed
   ↓
Serve with proper headers
   ↓
Browser can use response
```

---

## 🧪 Testing the Fix

### Verify CORS is Working

**In browser console (F12):**
```javascript
// Test CORS
fetch('http://localhost:5500/api/project/info?id=test')
  .then(r => r.json())
  .then(d => console.log('✅ CORS working:', d))
  .catch(e => console.error('❌ CORS error:', e))
```

Should print: `✅ CORS working: {...}`

### Check Headers

```bash
# In terminal:
curl -I http://localhost:5500/

# Look for:
# Access-Control-Allow-Origin: *
# Cross-Origin-Embedder-Policy: require-corp
```

---

## 📞 Still Having Issues?

### Check Server Logs

```bash
# Terminal shows detailed logs:
# [timestamp] GET /api/... - 200 (5ms)
# [timestamp] POST /api/preview/... - 200 (10ms)

# Look for errors:
# [ERROR] CORS check failed
# [ERROR] Preview not found
```

### Browser DevTools (F12)

**Network tab:**
- Check response headers
- Look for `Access-Control-Allow-Origin`
- Verify status is 200 (not 404/500)

**Console tab:**
- CORS errors show clearly
- Terminal connection status
- Preview loading logs

---

## 🚀 Best Practices

### 1. Use Preview Correctly
✅ Run `npm start` for Node.js projects  
✅ Click preview link for new window  
✅ Check terminal for server status  
❌ Don't double-click index.html  
❌ Don't rely only on integrated preview  

### 2. Handle CORS Properly
✅ Server adds headers automatically  
✅ No need for manual config  
✅ Works across origins  
❌ Don't disable CORS in browser  
❌ Don't modify security settings  

### 3. Debug Issues
✅ Check browser console (F12)  
✅ Check server logs (terminal)  
✅ Check Network tab  
✅ Try separate browser tab  
✅ Restart server if needed  
❌ Don't ignore CORS warnings  
❌ Don't force unsecure settings  

---

## 📚 Reference

### Files Modified/Added
- `server/cors-config.js` — NEW
- `server/browser-preview-handler.js` — NEW
- `server.js` — ENHANCED

### Key Functions
```javascript
addCORSHeaders()          // Add CORS to response
handlePreflightRequest()  // Handle OPTIONS
createBrowserPreviewProxies() // Proxy vendor files
BrowserPreviewHandler     // New class for preview
```

### Environment Variables
```bash
PORT=5500                 # Server port
HOST=127.0.0.1           # Bind address
NODE_ENV=development     # Environment
```

---

## ✨ Summary

**The fix includes:**
- ✅ Automatic CORS header management
- ✅ Web container compatibility
- ✅ Vendor file proxying
- ✅ Safe iframe communication
- ✅ Preflight request handling

**You should:**
1. Update to v7.1+ (this version)
2. Run `npm run serve` normally
3. Use terminal preview for best experience
4. Enjoy CORS-free development! 🎉

---

**Happy Coding! 🚀**

If issues persist, check:
1. Server is running (`npm run serve`)
2. Browser console (F12) for errors
3. Server terminal logs
4. Network tab in DevTools
5. CORS headers are present

Questions? See INSTALLATION-GUIDE.md troubleshooting section.
