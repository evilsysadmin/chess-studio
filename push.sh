rsync -avh --progress \
  --exclude='.git/' \
  --exclude='.venv/' \
  --exclude='node_modules/' \
  --exclude='docs/' \
  --exclude='.env' \
  --exclude='.env.*' \
  /home/sysadmin/Downloads/chess-studio-*/ ./

git add -A
git status
git commit
git push

