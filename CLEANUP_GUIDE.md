# Cleanup Guide - Redundant Files

This document lists all redundant files that can be safely deleted now that we have the consolidated structure.

## 🗑️ Files to Delete

### Old Provider Files (Now consolidated in `src/providers/aiProvider.ts`)
```
✅ DELETE: src/popup/providers/openaiProvider.ts
✅ DELETE: src/popup/providers/anthropicProvider.ts  
✅ DELETE: src/popup/providers/ollamaProvider.ts
✅ DELETE: src/popup/providers/mockProvider.ts
✅ DELETE: src/popup/providers/aiSdkProvider.ts
✅ DELETE: src/popup/providers/index.ts
```

**Reason**: All provider logic is now in `src/providers/aiProvider.ts`

### Old Hook Files (Now in `src/hooks/`)
```
✅ DELETE: src/popup/hooks/useTheme.ts
✅ DELETE: src/popup/hooks/useAIChat.ts
✅ DELETE: src/popup/hooks/useMockAi.ts
```

**Reason**: Hooks are now centralized in `src/hooks/`

### Old Component Files (Now in `src/components/`)
```
✅ DELETE: src/popup/components/ChatBox.tsx
✅ DELETE: src/popup/components/ChatBoxWithAI.tsx
```

**Reason**: Components are now in `src/components/ChatBoxWithAI.tsx`

### Empty/Unused Directories
```
✅ DELETE: src/popup/providers/ (entire directory)
✅ DELETE: src/popup/hooks/ (entire directory)
✅ DELETE: src/popup/components/ (entire directory)
```

## 📁 Clean Directory Structure After Cleanup

```
extendy/
├── src/
│   ├── config/
│   │   └── providers.ts           ✨ NEW - All configs
│   ├── providers/
│   │   └── aiProvider.ts          ✨ NEW - All implementations  
│   ├── hooks/
│   │   ├── useTheme.ts            ✨ NEW - Moved here
│   │   └── useAIChat.ts           ✨ NEW - Moved here
│   ├── components/
│   │   └── ChatBoxWithAI.tsx      ✨ NEW - Moved here
│   ├── sidebar/
│   │   ├── SidebarApp.tsx         ✅ Updated
│   │   └── main.tsx               ✅ Kept
│   ├── options/
│   │   ├── OptionsApp.tsx         ✅ Kept
│   │   └── main.tsx               ✅ Kept
│   ├── popup/
│   │   ├── popupApp.tsx           ✅ Kept (if needed)
│   │   └── main.tsx               ✅ Kept (if needed)
│   └── styles.css                 ✅ Updated
├── public/
│   ├── manifest.json              ✅ Kept
│   ├── background.js              ✅ Kept
│   └── icons/                     ✅ Kept
├── ARCHITECTURE.md                ✨ NEW
├── AI_SDK_GUIDE.md                ✨ NEW
├── README.md                      ✨ NEW
└── package.json                   ✅ Updated
```

## 🔍 Verification Steps

Before deleting, verify these imports are updated:

### ✅ SidebarApp.tsx should import:
```typescript
import ChatBoxWithAI from '../components/ChatBoxWithAI'
import { useTheme } from '../hooks/useTheme'
import { AVAILABLE_PROVIDERS, getProviderDisplayName, DEFAULT_PROVIDER } from '../config/providers'
```

### ✅ ChatBoxWithAI.tsx should import:
```typescript
import { useAIChat, Message } from '../hooks/useAIChat'
```

### ✅ useAIChat.ts should import:
```typescript
import { createAIProvider } from '../providers/aiProvider'
```

## 🚀 Manual Deletion Commands

If you want to delete these files manually:

### Windows (PowerShell):
```powershell
Remove-Item -Path "src\popup\providers" -Recurse -Force
Remove-Item -Path "src\popup\hooks" -Recurse -Force
Remove-Item -Path "src\popup\components" -Recurse -Force
```

### Linux/Mac:
```bash
rm -rf src/popup/providers
rm -rf src/popup/hooks
rm -rf src/popup/components
```

### Or use VS Code:
1. Right-click on `src/popup/providers` folder
2. Select "Delete"
3. Repeat for `src/popup/hooks` and `src/popup/components`

## ⚠️ Important Notes

1. **Backup First**: Make sure you have a git commit or backup before deleting
2. **Test After**: Run `npm run dev` to ensure everything works
3. **Build Test**: Run `npm run build` to verify production build
4. **No Breaking Changes**: All functionality is preserved in the new structure

## 📊 Space Savings

- **Before**: ~20 files across multiple directories
- **After**: ~10 files in organized structure
- **Savings**: ~50% fewer files, much cleaner organization

## ✅ Benefits After Cleanup

1. **Cleaner Structure**: Logical organization by purpose
2. **Easier Navigation**: Files where you expect them
3. **Less Confusion**: No duplicate or outdated files
4. **Better Maintainability**: Single source of truth
5. **Faster Development**: Clear where to make changes

---

**Ready to delete? Make sure all imports are updated first!** ✨