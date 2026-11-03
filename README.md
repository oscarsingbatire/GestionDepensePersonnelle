# GestionDepensePersonnelle

Application de gestion des dépenses personnelles, construite en TypeScript avec une architecture monorepo. Elle permet de suivre les dépenses, gérer des catégories, définir des budgets, consulter des tableaux de bord et analyser les tendances de consommation.

## Aperçu

Ce projet est composé de :

- un front-end React/Vite pour l’interface utilisateur,
- un back-end API Express pour les opérations métier,
- une base de données PostgreSQL avec Drizzle ORM,
- une authentification via Clerk,
- un système de monitoring et d’analyse des dépenses.

## Fonctionnalités

- Ajouter, modifier et supprimer des dépenses
- Classer les dépenses par catégorie
- Suivre les budgets par période (journalière, hebdomadaire, mensuelle, annuelle)
- Consulter le tableau de bord des dépenses du jour, de la semaine, du mois et de l’année
- Analyser les dépenses par catégorie et par période
- Personnaliser les préférences (monnaie, thème)
- Authentification utilisateur sécurisée

## Stack technique

- Node.js
- TypeScript
- pnpm
- React + Vite
- Express
- PostgreSQL + Drizzle ORM
- Clerk
- Zod
- Tailwind CSS

## Structure du dépôt

```text
GestionDepensePersonnelle/
├── artifacts/
│   ├── api-server/         # API backend Express
│   ├── mes-depenses/      # Frontend React/Vite
│   └── mockup-sandbox/    # Sandbox de maquettes
├── lib/
│   ├── api-client-react/  # client API React généré
│   ├── api-spec/          # spécification OpenAPI
│   ├── db/                # modèle et accès base de données
│   └── ...
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .npmrc
├── replit.md
└── README.md
```

## Prérequis

Avant de lancer le projet, assure-toi d’avoir :

- Node.js 20+
- pnpm installé
- PostgreSQL disponible
- un compte Clerk avec les clés d’authentification

## Installation

1. Cloner le dépôt :

```bash
git clone https://github.com/oscarsingbatire/GestionDepensePersonnelle.git
cd GestionDepensePersonnelle
```

2. Installer les dépendances :

```bash
pnpm install
```

3. Configurer les variables d’environnement.

Crée un fichier `.env` dans le dossier du backend ou le dossier config utilisé par ton environnement, avec les variables suivantes :

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
CLERK_PUBLISHABLE_KEY=your_publishable_key
CLERK_SECRET_KEY=your_secret_key
```

Selon la configuration du projet, certains fichiers peuvent également attendre des variables front-end comme :

```env
VITE_CLERK_PUBLISHABLE_KEY=your_publishable_key
VITE_API_URL=http://localhost:3000
```

## Lancer le projet en local

### 1) Démarrer le backend

```bash
pnpm --filter @workspace/api-server run dev
```

Le serveur API démarre généralement sur le port 5000 ou sur le port configuré dans le projet.

### 2) Démarrer le frontend

```bash
pnpm --filter @workspace/mes-depenses run dev
```

### 3) Vérifier le type-check

```bash
pnpm run typecheck
```

### 4) Construire le projet

```bash
pnpm run build
```

## Déploiement

Ce projet est un monorepo fullstack. Le déploiement le plus simple est de séparer le front-end et le back-end :

### Option 1 : déploiement séparé

- Frontend : Vercel ou Netlify
- Backend : Render, Railway ou Fly.io
- Base de données : Neon, Supabase, Railway PostgreSQL, PostgreSQL classique

### Option 2 : déploiement sur Replit

Comme le dépôt contient des fichiers spécifiques Replit (`.replit`, `artifact.toml`), il peut aussi être exploité directement depuis Replit.

### Variables de production à configurer

- `DATABASE_URL`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `VITE_API_URL` (si le front utilise une URL API distincte)

### Exemple de publication GitHub

1. Vérifier que le dépôt est bien initialisé sur GitHub.
2. Faire un commit et un push :

```bash
git add .
git commit -m "Initial release: GestionDepensePersonnelle"
git push origin main
```

3. Connecter le dépôt à la plateforme de déploiement :
   - Vercel pour le frontend
   - Render/Railway pour le backend

## Bonnes pratiques de développement

- Utiliser `pnpm` uniquement (le projet le vérifie au démarrage)
- Ne pas modifier les fichiers OpenAPI sans vérifier les impacts sur le client généré
- Exécuter le type-check avant chaque livraison importante
- Gérer les clés Clerk et la base de données uniquement via des variables d’environnement

## Contribution

Les contributions sont les bienvenues. Avant de proposer une modification :

```bash
pnpm run typecheck
pnpm run build
```

## Licence

Ce projet est actuellement sans licence explicite. Vérifie avec le propriétaire du dépôt s’il faut en ajouter une.

## Contact

Dépôt : https://github.com/oscarsingbatire/GestionDepensePersonnelle

## Remarque

Le projet est prêt pour un démarrage local, mais le déploiement en production nécessite une configuration spécifique de l’environnement, notamment pour la base de données et la sécurité des clés d’authentification.
