<div align="center">

<img src="docs/banniere.png" alt="MicroCoaster WebApp, application web de pilotage" width="100%">

</div>

Application web de pilotage des circuits MicroCoaster. Elle découvre les modules ESP32 connectés, affiche leur état en temps réel, et permet de composer des séquences qui orchestrent un circuit entier.

En production sur **[app.microcoaster.com](https://app.microcoaster.com)**.

## Deux liaisons temps réel

L'application parle à deux mondes qui n'ont pas les mêmes besoins, et utilise donc deux canaux distincts.

**Socket.io vers les navigateurs.** Reconnexion automatique, repli sur du long polling, salles par utilisateur. C'est confortable côté web et ça tolère un réseau capricieux.

**WebSocket natif vers les ESP32.** Pas de surcouche, pas de négociation de transport : un microcontrôleur n'a ni la mémoire ni le besoin d'un client Socket.io. Les modules s'authentifient à la connexion, puis échangent des messages JSON courts.

## Structure

| Dossier | Contenu |
|:--|:--|
| `api/` | Gestionnaires d'événements : modules, utilisateurs, notifications |
| `bdd/` | Accès aux données, un DAO par entité, sur une base commune |
| `websocket/` | Liaison avec les modules ESP32 |
| `routes/` | Routes HTTP |
| `views/` | Gabarits des pages |
| `middleware/` | Authentification, contrôle d'accès |
| `locales/` | Traductions de l'interface |
| `sql/` | Schéma et données initiales |
| `esp/` | Firmwares de référence des modules |
| `sim/` | Simulateurs de modules, pour développer sans matériel |
| `tests/` | Tests automatisés |

Le dossier `sim/` mérite un mot : il contient des simulateurs qui se font passer pour de vrais modules. On développe et on teste l'orchestration d'un circuit complet sans avoir à câbler quoi que ce soit.

## Installation

```bash
git clone https://github.com/Microcoaster/MicroCoasterWebApp.git
cd MicroCoasterWebApp
npm install
cp .env.example .env
```

Renseigner `.env`, puis créer la base :

```bash
mysql -u root -p < sql/schema.sql
mysql -u root -p < sql/default_data.sql
```

## Lancer

```bash
npm start           # démarrage
npm test            # tests
npx eslint .        # analyse statique
```

## Un point à traiter

`sql/default_data.sql` contient les secrets d'authentification des modules en clair, les mêmes que ceux écrits en dur dans les firmwares de `esp/`.

Ces secrets sont ce qui distingue un module légitime d'un client quelconque qui se connecterait au WebSocket. Les laisser dans un fichier versionné les expose à toute personne ayant accès au dépôt, et les grave dans l'historique Git même après correction.

La correction tient en trois temps : un secret différent par module physique, généré à l'appairage et non plus écrit à l'avance ; côté serveur un stockage haché, jamais en clair ; côté module un enregistrement en mémoire non volatile, au même titre que les identifiants WiFi.

## Écosystème

Les modules pilotés par cette application ont chacun leur dépôt : [Switch Track](https://github.com/Microcoaster/Switch-Track), [Launch Track](https://github.com/Microcoaster/Launch-Track), [Lift Hill](https://github.com/Microcoaster/Lift-Hill), [Module Audio](https://github.com/Microcoaster/Module-Audio), [Smoke Machine](https://github.com/Microcoaster/Smoke-Machine). Le socle commun est le [WiFi Manager](https://github.com/Microcoaster/MicroCoaster_WifiManager).

---

<sub>MicroCoaster · microcoaster.com</sub>
