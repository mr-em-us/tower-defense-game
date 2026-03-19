---
description: "Watch the AI play visually in the browser, taking screenshots at key moments to understand what it's building and where it's failing."
---

# Watch AI Skill

Visually observe the AI playing to understand its maze construction and identify spatial issues.

## Step 1: Start game server
Ensure preview server is running on port 9090.

## Step 2: Open browser and start observing
Navigate to http://localhost:9090 in Chrome (use Claude in Chrome MCP).
- Enter name "Observer"
- Click "Watch AI Play" or equivalent observer mode button

## Step 3: Take screenshots at key moments
Take a screenshot at each of these points:
1. **End of wave 1 build phase** — see initial maze layout
2. **End of wave 3 build phase** — see maze growth
3. **During wave 5 combat** — see if enemies leak
4. **End of wave 5 build phase** — see mature maze + AA placement
5. **During first air wave** — see AA effectiveness

For each screenshot:
- Save to disk so user can see it
- Describe what you observe: maze shape, wall thickness, tower distribution, path flow
- Note any issues: dead zones, wasted walls, gaps in defense

## Step 4: Analyze spatial layout
From the screenshots, answer:
1. Are walls 1 cell or 2+ cells thick?
2. How many switchback corridors are there?
3. Where are the AA towers relative to row 14?
4. Are there dead towers (towers not adjacent to the path)?
5. Where do enemies seem to leak (if they do)?

## Step 5: Report findings
Provide a clear summary with screenshots attached:
- What the maze looks like
- What's working
- What's wrong spatially
- Specific coordinate-based suggestions for improvement
