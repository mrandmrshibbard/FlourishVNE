# Multi-Variable Asset Filtering Guide

## Overview
The AssetCycler now supports filtering by **multiple variables simultaneously**, enabling complex character customization where a single layer combines multiple attributes (e.g., body type + skin color).

## How It Works

### Asset Naming Convention
Your assets should follow a naming pattern that combines multiple attributes:
- `slim_light` - slim body type, light skin
- `slim_dark` - slim body type, dark skin
- `muscular_light` - muscular body type, light skin
- `muscular_dark` - muscular body type, dark skin

**Important:** The filter pattern matches against **asset names**, not asset IDs.

### Variables Setup
Create separate string variables for each attribute:
1. `body_type` - stores the selected asset ID from body type cycler
2. `skin_tone` - stores the selected asset ID from skin tone cycler
3. `body_full` - stores the final combined asset ID for display

### AssetCycler Configuration

#### Master Cyclers (No Filtering)
These cyclers allow users to select individual attributes. Each asset they cycle through should have a **name** representing that attribute.

**Body Type Cycler:**
- Layer: `bodytype`
- Variable: `body_type`
- Assets: Select one representative asset per type, **named**:
  - `slim` or `body_slim`
  - `muscular` or `body_muscular`
  - `heavy` or `body_heavy`
- Filter Variables: (none)
- Filter Pattern: (none)

**Skin Tone Cycler:**
- Layer: `bodytype` (can be same layer)
- Variable: `skin_tone`
- Assets: Select one representative asset per tone, **named**:
  - `light` or `skin_light`
  - `medium` or `skin_medium`  
  - `dark` or `skin_dark`
- Filter Variables: (none)
- Filter Pattern: (none)

#### Filtered Cycler (Multi-Variable)
This cycler shows only assets matching the selected attributes. The filter pattern is built from the **names** of the assets selected in master cyclers.

**Full Body Cycler:**
- Layer: `bodytype` (the layer with all combined assets)
- Variable: `body_full` (the actual asset to display)
- Assets: Check ALL body assets (should be **named** like `slim_light`, `muscular_dark`, etc.)
- Filter Variables: Click "+ Add Filter Variable" twice
  - Add: `body_type`
  - Add: `skin_tone`
- Filter Pattern: `{body_type}_{skin_tone}`

### Pattern Syntax
The filter pattern uses `{}` placeholders that get replaced with **asset names** (or parts of names) from the filter variables.

#### Basic Syntax
Use generic placeholders that match **by position**:
- Pattern: `{body_type}_{skin_color}`
- First `{}` → replaced with asset name from first filter variable
- Second `{}` → replaced with asset name from second filter variable
- You can use any text inside `{}` for readability

**Example:**
- Filter Variables: [`body_type_var`, `skin_color_var`] (in that order)
- Filter Pattern: `{body_type}_{skin_color}` OR `{a}_{b}` OR `{}_{}`
- When first var = asset named "fem", second var = asset named "brown"
- Pattern becomes: `fem_brown`

#### Part Extraction Syntax (NEW!)
When your assets are named with multiple parts like `body_fem_brown`, you can extract specific parts using `[index]`:

**Syntax:** `{name[index]}_` where index is the part number (0-based, split by `_`)

**Example:**
- Asset name: `body_fem_brown`
  - Part [0]: `body`
  - Part [1]: `fem`
  - Part [2]: `brown`

**Usage:**
- Filter Variables: [`body_type_var`, `skin_color_var`]
- First var holds asset named: `body_fem_brown`
- Second var holds asset named: `body_masc_white`
- Filter Pattern: `{[1]}_{[2]}` 
  - Extracts part 1 from first var: `fem`
  - Extracts part 2 from second var: `white`
  - Final pattern: `fem_white`
- Shows assets containing `fem_white`

**Alternative with names:**
- Pattern: `{body_type[1]}_{skin_color[2]}`
- Same result as above, just more readable

#### Advanced: Specific Variable IDs
Use exact variable IDs when needed:
- Pattern: `{var-abc123[1]}_{var-def456[2]}`
- Extracts part 1 from var-abc123, part 2 from var-def456

**Key Points:**
- Asset names are split by `_` character
- Index starts at 0
- If index out of bounds, uses full asset name
- Case-insensitive matching

### CharacterPreview Setup
Map the layer to the **filtered variable**:
- `bodytype` layer → `body_full` variable

The CharacterPreview will display whichever asset the Full Body Cycler has selected.

## Example Flow

### Scenario: Assets named like `body_fem_brown`, `body_masc_white`

1. **Setup Master Cyclers:**
   - Body Type Cycler: Cycles through `body_fem_brown`, `body_masc_white`, etc. (sets `body_type` var)
   - Skin Tone Cycler: Cycles through any assets (sets `skin_tone` var)

2. **Setup Filtered Cycler:**
   - Filter Variables: [`body_type`, `skin_tone`] (in that order)
   - Filter Pattern: `{[1]}_{[2]}` 
     - Extracts part 1 (type: fem/masc) from first var
     - Extracts part 2 (color: brown/white/tan) from second var

3. **User Interaction:**
   - User selects body type → `body_type` = `body_fem_brown` (asset ID)
   - User selects skin tone → `skin_tone` = `body_masc_white` (asset ID)
   - Pattern resolves: `{[1]}_{[2]}` → `fem_white`
   - Filtered cycler shows only assets containing "fem_white"
   - User selects from filtered options → stored in `body_full` variable
   - CharacterPreview displays the selected asset

## Benefits
- ✅ Single layer can represent multiple attributes
- ✅ Works with any asset naming convention
- ✅ Extract specific parts from complex names
- ✅ Hierarchical customization (type + tone)
- ✅ Scalable to 3+ variables
- ✅ Dynamic filtering updates in real-time

## Tips
- **Asset names** are split by `_` character for part extraction
- All filter variables must have values for filtering to work
- Pattern matching is case-insensitive
- Use `[0]` for first part, `[1]` for second part, etc.
- If you don't need part extraction, just use `{}` and it will use the full asset name
- Use consistent naming convention: `attribute1_attribute2_attribute3`
- Test with console logs enabled to debug filtering
