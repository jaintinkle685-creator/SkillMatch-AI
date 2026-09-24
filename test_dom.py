import re

with open('index.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

with open('js/app.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

# Find all getElementById in js
js_ids = re.findall(r'getElementById\(["\']([^"\']+)["\']\)', js_content)
print(f"Total getElementById calls in js/app.js: {len(js_ids)}")

missing_ids = set()
critical_crashes = []

for gid in js_ids:
    pattern = f'id=["\']{re.escape(gid)}["\']'
    if not re.search(pattern, html_content):
        # check if dynamically rendered in js
        if f'id="{gid}"' not in js_content and f"id='{gid}'" not in js_content:
            missing_ids.add(gid)
            # check if js calls .addEventListener or methods directly without null check
            # e.g. document.getElementById("foo").addEventListener
            direct_call_re = re.compile(rf'getElementById\(["\']{re.escape(gid)}["\']\)\s*\.')
            if direct_call_re.search(js_content):
                critical_crashes.append(gid)

print(f"Missing IDs not found in index.html: {len(missing_ids)}")
if critical_crashes:
    print(f"\nCRITICAL: Found {len(critical_crashes)} direct method calls on missing elements (THESE CAUSE TypeError: Cannot read properties of null):")
    for c in critical_crashes:
        print(f"  CRITICAL CRASH: {c}")
else:
    print("No direct un-guarded calls on missing IDs found.")

print("\nAll missing IDs list:")
for m in sorted(missing_ids):
    print(f"  {m}")
