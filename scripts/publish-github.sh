#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$project_dir"
repository="Swiiptz/maison-planning"

account="$(gh api user --jq .login)"
if [[ "${account,,}" != "swiiptz" ]]; then
  echo "Compte connecté : $account. Connecte Swiiptz avant de relancer."
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  remote_url="$(git remote get-url origin)"
  case "$remote_url" in
    https://github.com/Swiiptz/maison-planning|https://github.com/Swiiptz/maison-planning.git|git@github.com:Swiiptz/maison-planning.git) ;;
    *) echo "Le remote origin pointe déjà vers $remote_url. Arrêt pour préserver ce dépôt."; exit 1 ;;
  esac
fi

if git show-ref --verify --quiet refs/heads/main && [[ "$(git branch --show-current)" != main ]]; then
  echo "Une branche main existe déjà. Arrêt pour préserver les branches."
  exit 1
fi

gh auth setup-git
git add -- .github .gitignore README.md app docs firebase.json firestore.indexes.json firestore.rules package.json scripts tests \
  'EDT MAINTENIR LA MAISON PROPRE.pdf' 'EDT MAINTENIR LA MAISON PROPRE Tache tranverse.pdf'
if ! git diff --cached --quiet; then
  git commit -m "Build household agenda with recurring tasks and Firebase services"
fi
git branch -m main 2>/dev/null || [[ "$(git branch --show-current)" == main ]]

if ! gh repo view "$repository" --json name >/dev/null 2>&1; then
  gh repo create "$repository" --public --description "Agenda partagé des tâches de la maison"
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/$repository.git"
fi
git push --set-upstream origin main
echo "Projet envoyé : https://github.com/$repository"
