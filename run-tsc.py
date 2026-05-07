import subprocess, os
env = os.environ.copy()
env.pop('NODE_OPTIONS', None)
env.pop('NODE_PATH', None)
result = subprocess.run(
    ['D:/node/node.exe',
     'd:/WorkBuddy-projects/aiTest/fee-manager/node_modules/typescript/bin/tsc',
     '--noEmit', '--project', 'd:/WorkBuddy-projects/aiTest/fee-manager/tsconfig.json'],
    env=env,
    capture_output=True, text=True, cwd='d:/WorkBuddy-projects/aiTest/fee-manager'
)
print('STDOUT:', result.stdout[:5000])
print('STDERR:', result.stderr[:5000])
print('RC:', result.returncode)
