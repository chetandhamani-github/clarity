import os
import re

APP_DIR = "src/app/(app)"

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    if "boneyard-js/native" not in content:
        return

    # 1. Remove boneyard-js import
    content = re.sub(r"import \{.*?Skeleton.*?\} from 'boneyard-js/native';\n?", "", content)

    # 2. Add Loader to @/components/ui import if not present
    if "Loader" not in content:
        if "@/components/ui" in content:
            # find the import statement and add Loader
            content = re.sub(r"(import\s+\{[^}]*?)(\s*\})?(\s*\}?\s*from\s+['\"]@/components/ui['\"];?)", 
                             lambda m: m.group(1) + ", Loader" + (m.group(3) if not m.group(2) else m.group(2) + m.group(3)) if "}" in m.group(0) else m.group(0), content)
            
            # simpler fix: just find the first import { ... } from '@/components/ui'
            # Let's just do a manual string replace
            import_ui = re.search(r"import \{([^}]+)\} from '@/components/ui';", content)
            if import_ui:
                imports = import_ui.group(1)
                if "Loader" not in imports:
                    new_imports = imports + ", Loader"
                    content = content.replace(f"import {{{imports}}} from '@/components/ui';", f"import {{{new_imports}}} from '@/components/ui';")
        else:
            # add import at the top
            content = "import { Loader } from '@/components/ui';\n" + content

    # 3. Replace <Skeleton ... loading={...} ... >
    # We need to capture the condition inside loading={...}
    # It might be `loading={isLoading || isDeleting}`
    # Regex: <Skeleton [^>]*?loading=\{(.*?)\}[^>]*>
    content = re.sub(r"<Skeleton[^>]*?loading=\{(.*?)\}[^>]*>", r"{ \1 ? <Loader /> : (<>", content)
    
    # 4. Replace </Skeleton>
    content = re.sub(r"</Skeleton>", r">)}", content)

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Processed {filepath}")

for root, dirs, files in os.walk(APP_DIR):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            process_file(os.path.join(root, file))
