#!/usr/bin/env python3
"""Safely infer auth dependencies from existing protected routes and wire router.
Refuses to edit when inference is ambiguous.
"""
from pathlib import Path
import ast, re, sys

root=Path(__file__).resolve().parents[1]
main_path=root/'backend-python/main.py'
requirements_path=root/'backend-python/requirements.txt'

# The remote provider is runtime code, not a test-only dependency. Keep the
# existing requirements untouched and append httpx only when it is absent.
if not requirements_path.exists():
    print('REFUSE: backend-python/requirements.txt not found', file=sys.stderr)
    raise SystemExit(2)
requirements = requirements_path.read_text('utf-8')
if not re.search(r'(?mi)^\s*httpx(?:\[[^]]+\])?\s*(?:[<>=!~]|$)', requirements):
    suffix = '' if not requirements or requirements.endswith('\n') else '\n'
    requirements_path.write_text(requirements + suffix + 'httpx>=0.27,<1\n', 'utf-8')
    print('Added runtime dependency: httpx>=0.27,<1')

source=main_path.read_text('utf-8')
if 'build_narrative_router(' in source:
    print('Narrative router already integrated.'); raise SystemExit(0)

tree=ast.parse(source)

def route_path(fn):
    for d in fn.decorator_list:
        if isinstance(d,ast.Call) and isinstance(d.func,ast.Attribute) and d.args and isinstance(d.args[0],ast.Constant):
            if d.func.attr in {'get','post','put','delete','patch'}: return str(d.args[0].value)
    return None

def deps(fn):
    names=[]
    args=list(fn.args.args)+list(fn.args.kwonlyargs)
    defaults=[None]*(len(fn.args.args)-len(fn.args.defaults))+list(fn.args.defaults)+list(fn.args.kw_defaults)
    for arg,default in zip(args,defaults):
        if isinstance(default,ast.Call) and isinstance(default.func,ast.Name) and default.func.id=='Depends' and default.args:
            target=default.args[0]
            if isinstance(target,ast.Name): names.append(target.id)
    return names

routes={}
for node in tree.body:
    if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
        p=route_path(node)
        if p: routes[p]=deps(node)

def choose(paths):
    candidates=[]
    for p in paths:
        candidates += routes.get(p,[])
    uniq=[]
    for x in candidates:
        if x not in uniq: uniq.append(x)
    return uniq

auth=choose(['/api/profile','/api/auth/me'])
admin=choose(['/api/admin/users'])
if len(auth)!=1:
    print('REFUSE: could not infer exactly one JWT dependency from /api/profile or /api/auth/me:',auth,file=sys.stderr); raise SystemExit(2)
if len(admin)>1:
    print('REFUSE: ambiguous admin dependency:',admin,file=sys.stderr); raise SystemExit(2)

import_line='from narrative_api import build_narrative_router\n'
insert='\n# LLM narrative transport: facts stay authoritative in Chess Studio.\napp.include_router(build_narrative_router(auth_dependency=%s%s))\n' % (auth[0], f', admin_dependency={admin[0]}' if admin else '')

# import near other imports
lines=source.splitlines(True)
last_import=0
for i,line in enumerate(lines):
    if line.startswith('import ') or line.startswith('from '): last_import=i+1
lines.insert(last_import,import_line)
source=''.join(lines)

# include router only after the inferred dependency functions exist.
new_tree=ast.parse(source)
app_stmt=None
def_lines={}
for node in new_tree.body:
    if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='app' for t in node.targets):
        if isinstance(node.value,ast.Call): app_stmt=node
    if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
        def_lines[node.name]=node.end_lineno
if app_stmt is None:
    print('REFUSE: app = FastAPI(...) not found',file=sys.stderr); raise SystemExit(2)
required=[auth[0]] + ([admin[0]] if admin else [])
missing=[name for name in required if name not in def_lines]
if missing:
    print('REFUSE: inferred dependencies are not module-level functions:', missing, file=sys.stderr); raise SystemExit(2)
insert_after=max([app_stmt.end_lineno] + [def_lines[name] for name in required])
sl=source.splitlines(True); sl.insert(insert_after,insert)
main_path.write_text(''.join(sl),'utf-8')
print(f'Integrated /api/narrative using auth={auth[0]} admin={admin[0] if admin else "disabled"}')
