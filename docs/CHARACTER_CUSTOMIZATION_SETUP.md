# Character Customization Setup Guide

## Complete Step-by-Step Instructions

This guide shows you exactly how to set up a character customization screen where players can independently select **body type** and **skin color**, with all assets in a single character layer.

---

## 📋 Prerequisites

Your assets must be named following this pattern:
- `body_fem_brown.png`
- `body_fem_white.png`
- `body_masc_brown.png`
- `body_masc_white.png`
- etc.

**Pattern**: `{prefix}_{bodyType}_{skinColor}.png`

---

## 🎯 Step 1: Create Your Character

1. Go to **Characters** tab
2. Click **+ New Character**
3. Name it: `Player Character`
4. Click **+ Add Layer** and name it: `body`
5. Click **Manage Assets** on the body layer
6. Upload ALL your body sprite variations (all combinations of body types and skin colors)
7. Make sure each asset is named with the pattern above (e.g., `body_fem_brown`)

---

## 🎯 Step 2: Create Variables to Store Selections

1. Go to **Variables** tab
2. Create these **3 String variables**:

| Variable Name | Type | Initial Value |
|--------------|------|---------------|
| `bodyType` | String | *(leave empty)* |
| `skinColor` | String | *(leave empty)* |
| `selectedBody` | String | *(leave empty)* |

**Why these variables?**
- `bodyType` - Stores the asset ID of the selected body type
- `skinColor` - Stores the asset ID of the selected skin color
- `selectedBody` - Stores the asset ID to display in the character preview

**Note**: These will store asset IDs (like `asset-xyz123`), not names. The filtering system reads the asset names automatically.

---

## 🎯 Step 3: Create the Character Customization Screen

1. Go to **UI Screens** tab
2. Click **+ New Screen**
3. Name it: `Character Customization`

---

## 🎯 Step 4: Add Character Preview

1. With your new screen selected, click **+ Add Element**
2. Select **CharacterPreview**
3. Configure it:
   - **Character**: Select `Player Character`
   - **X Position**: `400` (center-left)
   - **Y Position**: `300` (centered)
   - **Scale**: `1.0` or adjust to your preference

4. **CRITICAL**: Click **Layer Variable Map**
   - For the `body` layer, select variable: `selectedBody`
   - This tells the preview to display whatever asset ID is stored in `selectedBody`

---

## 🎯 Step 5: Add Body Type Selector

1. Click **+ Add Element** → Select **AssetCycler**
2. Configure it:
   - **Label**: `Body Type`
   - **Character**: `Player Character`
   - **Layer**: `body`
   - **Variable**: `bodyType`
   - **X Position**: `100`
   - **Y Position**: `200`
   - **Show Asset Name**: ✅ Check this box (so player sees the asset name)

3. **Select only 2 assets** - one of each body type with the SAME skin color:
   - Example: `body_fem_brown` and `body_masc_brown`
   - Or: `body_fem_white` and `body_masc_white`
   - Pick any skin color, but both body types

4. **Do NOT add any filter variables or pattern**

**What this does**: 
- Shows only 2 options (fem vs masc in the same skin color)
- Player cycles between body types
- Stores the asset ID in `bodyType`

---

## 🎯 Step 6: Add Skin Color Selector

1. Click **+ Add Element** → Select **AssetCycler**
2. Configure it:
   - **Label**: `Skin Color`
   - **Character**: `Player Character`
   - **Layer**: `body`
   - **Variable**: `skinColor`
   - **X Position**: `100`
   - **Y Position**: `350`
   - **Show Asset Name**: ✅ Check this box (so player sees the asset name)

3. **Select 4 assets** - all skin colors with the SAME body type:
   - Example: `body_fem_brown`, `body_fem_white`, `body_fem_tan`, `body_fem_mixed`
   - Or: `body_masc_brown`, `body_masc_white`, `body_masc_tan`, `body_masc_mixed`
   - Pick any body type, but all skin colors

4. **Do NOT add any filter variables or pattern**

**What this does**: 
- Shows only 4 options (different skin colors in the same body type)
- Player cycles between skin colors
- Stores the asset ID in `skinColor`

---

## 🎯 Step 7: Add Asset Matcher (The Magic!)

1. Click **+ Add Element** → Select **AssetCycler**
2. **Make it INVISIBLE** - this one works behind the scenes
3. Configure it:
   - **Label**: Leave blank or `(Hidden)`
   - **Character**: `Player Character`
   - **Layer**: `body`
   - **Variable**: `selectedBody` ⚠️ (Different from the other two!)
   - **X Position**: `-1000` (off-screen)
   - **Y Position**: `-1000` (off-screen)
   - **Width**: `10`
   - **Height**: `10`

4. **Select ALL 8 assets** (all body type + skin color combinations)

5. Click **+ Add Filter Variable** → Select `bodyType` (ADD THIS ONE FIRST!)
6. Click **+ Add Filter Variable** → Select `skinColor` (ADD THIS ONE SECOND!)
7. Set **Filter Pattern**: `{[1]}_{[2]}`
   - `{[1]}` extracts part [1] from the FIRST filter variable (bodyType)
   - `{[2]}` extracts part [2] from the SECOND filter variable (skinColor)
   - **ORDER MATTERS!** The placeholders extract from filter variables by position!

**What this does - THE KEY TO EVERYTHING**: 
1. When player selects `body_fem_brown` in Body Type cycler:
   - `bodyType` variable = ID of `body_fem_brown`
   - Hidden matcher extracts part [1] from "body_fem_brown" → "fem"
   
2. When player selects `body_fem_white` in Skin Color cycler:
   - `skinColor` variable = ID of `body_fem_white`
   - Hidden matcher extracts part [2] from "body_fem_white" → "white"
   
3. Hidden matcher combines them:
   - Pattern `{[1]}_{[2]}` becomes "fem_white"
   - Searches all 8 assets for one containing "fem_white"
   - Finds `body_fem_white` ✅
   - Sets `selectedBody` = ID of that asset
   
4. CharacterPreview displays whatever asset ID is in `selectedBody`!

---

## ⚠️ CRITICAL: Why No Filtering on Body Type & Skin Color Cyclers?

**The key insight**: If you add filters to the Body Type and Skin Color cyclers, they become circular dependencies! 

- Body Type cycler filters by bodyType (itself!) → Shows only 1 option
- Skin Color cycler filters by skinColor (itself!) → Shows only 1 option

**The solution**: 
- Body Type cycler: Select assets showing different body types (e.g., `body_fem_brown` + `body_masc_brown`)
- Skin Color cycler: Select assets showing different skin colors (e.g., `body_fem_brown` + `body_fem_white` + `body_fem_tan`)
- Hidden matcher: Select ALL assets, has filters to find the combination

**Asset Selection Strategy:**

```
Body Type Cycler Assets:
├─ body_fem_brown    ← Shows "fem" body type
└─ body_masc_brown   ← Shows "masc" body type
   (Same skin color, different body types)

Skin Color Cycler Assets:
├─ body_fem_brown    ← Shows "brown" skin
├─ body_fem_white    ← Shows "white" skin
├─ body_fem_tan      ← Shows "tan" skin
└─ body_fem_mixed    ← Shows "mixed" skin
   (Same body type, different skin colors)

Hidden Matcher Assets:
├─ body_fem_brown
├─ body_fem_white
├─ body_fem_tan
├─ body_fem_mixed
├─ body_masc_brown
├─ body_masc_white
├─ body_masc_tan
└─ body_masc_mixed
   (ALL combinations for matching!)
```

**How it works:**
1. Player cycles Body Type: `body_fem_brown` → `body_masc_brown`
2. `bodyType` variable now stores ID of `body_masc_brown`
3. Hidden matcher extracts `[1]` from `body_masc_brown` → `masc`
4. Hidden matcher extracts `[2]` from current `skinColor` (say `body_fem_white`) → `white`
5. Pattern becomes `masc_white`
6. Hidden matcher finds `body_masc_white` from its full list
7. Sets `selectedBody` to that asset's ID
8. CharacterPreview updates!

---

## 🎯 Step 8: Add Continue Button

1. Click **+ Add Element** → Select **Button**
2. Configure it:
   - **Text**: `Continue`
   - **X Position**: `600`
   - **Y Position**: `500`
   - **Width**: `200`
   - **Height**: `50`

3. Click **+ Add Action** → Select **CloseScreen**

---

## 🎯 Step 9: Test in a Scene

1. Go to **Scenes** tab
2. Create or open a scene
3. Add a **ShowScreen** command
4. Select your `Character Customization` screen
5. Add a **ShowCharacter** command after it
6. Select `Player Character`
7. Click **▶ Play** to test!

---

## 📊 Variable Flow Diagram

```
Player clicks "Body Type" arrows
         ↓
bodyType variable = "asset-xyz123" (asset ID)
         ↓
System reads asset name: "body_fem_brown"
         ↓
Hidden AssetCycler filters assets by pattern {[1]}_{[2]}
         ↓
Pattern extracts parts: [1]="fem", [2]="brown" (from bodyType asset)
Pattern extracts parts: [1]="fem", [2]="brown" (from skinColor asset)
         ↓
Pattern becomes "fem_brown"
         ↓
Finds matching asset: "body_fem_brown"
         ↓
selectedBody variable = "asset-abc456" (asset ID of match)
         ↓
CharacterPreview displays the asset with that ID
```

---

## ✅ Verification Checklist

- [ ] Character has one layer with ALL 8 body variations
- [ ] All assets follow the naming pattern: `body_fem_brown`, `body_masc_white`, etc.
- [ ] Created 3 String variables: `bodyType`, `skinColor`, `selectedBody` (all empty initially)
- [ ] CharacterPreview maps body layer to `selectedBody` variable
- [ ] Body Type cycler: Selected 2 assets (both body types, same skin color), NO filters
- [ ] Skin Color cycler: Selected 4 assets (all skin colors, same body type), NO filters  
- [ ] Hidden matcher: Selected ALL 8 assets, HAS 2 filter variables, pattern = `{[1]}_{[2]}`
- [ ] Hidden matcher is positioned off-screen (negative X/Y values)
- [ ] Body Type cycler stores in `bodyType`, Skin Color stores in `skinColor`, Hidden stores in `selectedBody`

---

## 🎨 Asset Naming Examples

### If your assets are named like this:
```
body_fem_brown.png
body_fem_white.png
body_fem_tan.png
body_masc_brown.png
body_masc_white.png
body_masc_tan.png
```

### Then your setup is:
- **Filter Pattern**: `{[1]}_{[2]}`
- **Part [0]**: `body` (prefix)
- **Part [1]**: `fem` or `masc` (body type)
- **Part [2]**: `brown`, `white`, `tan` (skin color)

### If your assets have a different pattern:
```
char_tall_dark.png
char_short_light.png
```

Then adjust:
- **Part [0]**: `char` (prefix)
- **Part [1]**: `tall`, `short` (height)
- **Part [2]**: `dark`, `light` (skin tone)

---

## 🔧 Troubleshooting

### ⚠️ **"Body Type cycler shows same body type, just different colors!"**
**CAUSE**: You selected the wrong 2 assets for the Body Type cycler.

**FIX**: 
1. Select the Body Type cycler element
2. Look at the **Asset IDs** section
3. You should have selected assets with DIFFERENT body type parts:
   - ✅ CORRECT: `body_fem_brown` + `body_masc_brown` (different body, same color)
   - ❌ WRONG: `body_fem_brown` + `body_fem_white` (same body, different color)
4. Remove the wrong assets and add the correct ones
5. Make sure both assets have the same skin color but different body types!

**TIP**: Enable "Show Asset Name" on the cycler to see exactly which assets you selected.

### ⚠️ **"Skin Color cycler shows different body types!"**
**CAUSE**: You selected the wrong 4 assets for the Skin Color cycler.

**FIX**:
1. Select the Skin Color cycler element  
2. Look at the **Asset IDs** section
3. You should have selected assets with the SAME body type:
   - ✅ CORRECT: All `body_fem_*` or all `body_masc_*`
   - ❌ WRONG: Mix of `body_fem_*` and `body_masc_*`
4. Remove the wrong assets and add the correct ones

### ⚠️ **"Character doesn't change when I cycle Body Type!"**
**CAUSE**: The filter variables are in the wrong order on the hidden matcher.

**FIX**:
1. Select the hidden matcher cycler (the invisible one)
2. Look at the **Filter Variables** section
3. The order MUST be: `bodyType` FIRST, `skinColor` SECOND
4. If they're backwards, remove them and re-add in the correct order
5. The pattern `{[1]}_{[2]}` extracts from filter variables by position!

**WHY**: `{[1]}` means "extract part 1 from the FIRST filter variable". If skinColor is first, it extracts from the wrong variable!

### ⚠️ **"I only see one body type in one color!"**
**CAUSE**: You added filters to the Body Type or Skin Color cyclers.

**FIX**: 
1. Select the Body Type cycler
2. Remove ALL filter variables
3. Remove the filter pattern
4. Select the Skin Color cycler
5. Remove ALL filter variables
6. Remove the filter pattern
7. ONLY the hidden matcher should have filters!

**WHY**: If Body Type filters by bodyType, it can only show the currently selected value. You want it to show ALL body types so the player can choose.

### Character doesn't appear
- Check that `selectedBody` has a value (open Variables tab during play)
- Verify CharacterPreview layer map points to `selectedBody` variable
- Make sure hidden matcher cycler is storing to `selectedBody`

### Cyclers show no options or wrong options
- Check that filter pattern matches your asset names
- Verify all 3 cyclers use the SAME filter variables
- Check console logs for filtering debug info

### Character doesn't update when clicking arrows
- Ensure the visible cyclers store to `bodyType` and `skinColor` (NOT selectedBody)
- Verify hidden matcher cycler stores to `selectedBody`
- Check that initial variable values match actual asset name parts

### Assets have different naming pattern
- Split your asset name by `_` character
- Count which parts are which (0-indexed)
- Adjust filter pattern indices: `{[0]}`, `{[1]}`, `{[2]}`, etc.

---

## 💡 Advanced: More Than 2 Variables

If you have assets like: `body_fem_brown_athletic.png`

1. Create additional variables:
   - `bodyType` (fem/masc)
   - `skinColor` (brown/white/tan)
   - `bodyShape` (athletic/average/heavy)
   - `selectedBody` (stores result)

2. Update filter pattern: `{[1]}_{[2]}_{[3]}`

3. Add filter variables to all cyclers:
   - Body Type cycler: filters by bodyType, skinColor, bodyShape
   - Skin Color cycler: filters by bodyType, skinColor, bodyShape
   - Body Shape cycler: filters by bodyType, skinColor, bodyShape
   - Hidden matcher: filters by bodyType, skinColor, bodyShape

4. Create a cycler for each variable (plus the hidden matcher)

---

## 📦 Sample Project

Import the included **character_customization_sample_export.zip** to see a working example with:
- Pre-configured character with 8 body variations
- All variables set up correctly
- Working customization screen
- Example scene that launches it

**To import**:
1. Project Hub → Import Project
2. Select the zip file
3. Click through scenes and UI screens to see how it's configured

---

## 🎓 Key Concepts

### Why 3 AssetCyclers?
1. **Body Type Cycler** - User-facing, shows ALL assets, stores selection ID
2. **Skin Color Cycler** - User-facing, shows ALL assets, stores selection ID
3. **Hidden Matcher** - Behind the scenes, filters by BOTH selections, stores matching asset ID for display

### Why use part extraction `{[1]}_{[2]}`?
Because the hidden matcher needs to extract parts from the asset names of the selected bodyType and skinColor to find the matching asset.

### Why NO filters on the visible cyclers?
If Body Type filters by bodyType, it creates a circular dependency - it can only show the currently selected body type! Same for Skin Color. We want them to show ALL options.

### Why filter ONLY the hidden matcher?
The hidden matcher's job is to say "Given the current bodyType selection AND the current skinColor selection, which asset matches BOTH?" It filters to find that one asset.

---

## 📝 Quick Reference Card

```
VARIABLES (String type, all empty initially):
├─ bodyType = ""
├─ skinColor = ""
└─ selectedBody = ""

UI SCREEN ELEMENTS:
├─ CharacterPreview (character=Player, layerMap: body→selectedBody)
├─ AssetCycler #1 (label="Body Type", var=bodyType, NO FILTERS)
├─ AssetCycler #2 (label="Skin Color", var=skinColor, NO FILTERS)
├─ AssetCycler #3 (HIDDEN, var=selectedBody, filters=[bodyType,skinColor], pattern={[1]}_{[2]})
└─ Button (text="Continue", action=CloseScreen)

ONLY THE HIDDEN MATCHER HAS FILTERS!
```

---

**Need help?** Check the console logs when testing - they show exactly what the filters are doing!