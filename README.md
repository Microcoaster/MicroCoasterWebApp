<div align="center">

<p>
  <img src="docs/langues/fr-on.png" alt="Français, page affichée" width="150" />
  <a href="README.en.md"><img src="docs/langues/en-off.png" alt="Read this page in English" width="150" /></a>
</p>

<img src="docs/banniere.png" alt="MicroCoaster WebApp, application web de pilotage" width="100%">

</div>

Application web de pilotage des circuits MicroCoaster. Elle découvre les modules ESP32 connectés, affiche leur état en temps réel, et permet de composer des séquences qui orchestrent un circuit entier.

En production sur **[app.microcoaster.com](https://app.microcoaster.com)**.

<img src="docs/sections/s01.png" alt="01 Architecture" width="100%">

L'application parle à deux mondes qui n'ont pas les mêmes besoins, et utilise donc deux canaux distincts.

<img src="docs/schemas/architecture.png" alt="Les navigateurs dialoguent avec l'application par Socket.io, qui apporte reconnexion automatique, repli sur long polling et salles par utilisateur. Ils y découvrent les modules connectés, la télémétrie en temps réel, la composition de séquences, les comptes et les notifications. Les modules ESP32 dialoguent par WebSocket natif, en messages JSON courts avec authentification à la connexion : Switch Track, Launch Track, Lift Hill, Module Audio, Smoke Machine et les simulateurs. Au centre, la WebApp en Node.js, Express et MySQL est la seule à connaître l'état complet du circuit." width="100%">

**Socket.io vers les navigateurs.** Reconnexion automatique, repli sur du long polling, salles par utilisateur. C'est confortable côté web et ça tolère un réseau capricieux.

**WebSocket natif vers les ESP32.** Pas de surcouche, pas de négociation de transport : un microcontrôleur n'a ni la mémoire ni le besoin d'un client Socket.io. Les modules s'authentifient à la connexion, puis échangent des messages JSON courts.

C'est aussi ici que se concentre l'autorité du système. Un module ne décide jamais seul de bouger : il exécute un ordre venu de cette application, qui est la seule à connaître l'état complet du circuit.

<img src="docs/sections/s02.png" alt="02 Structure" width="100%">

<img src="docs/schemas/arborescence.png" alt="Arborescence du dépôt. api : les gestionnaires d'événements, modules, utilisateurs, notifications. websocket : la liaison avec les modules ESP32. bdd : l'accès aux données, un DAO par entité. routes : les routes HTTP. middleware : authentification et contrôle d'accès. views : les gabarits des pages. public : les ressources servies telles quelles. locales : les traductions de l'interface. sql : le schéma et les données initiales. esp : les firmwares de référence des modules. sim : les simulateurs de modules, pour développer sans matériel. tests : les tests automatisés. utils : les fonctions partagées." width="100%">

Le dossier `sim/` mérite un mot : il contient des simulateurs qui se font passer pour de vrais modules. On développe et on teste l'orchestration d'un circuit complet sans avoir à câbler quoi que ce soit.

<img src="docs/sections/s03.png" alt="03 Installation" width="100%">

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

<img src="docs/sections/s04.png" alt="04 Développement" width="100%">

```bash
npm start           # démarrage
npm test            # tests
npx eslint .        # analyse statique
```

Le cycle est celui de l'organisation : une issue décrit le travail, une branche part de `develop`, une pull request revient dessus et passe en review avant d'atteindre `main`.

<img src="docs/sections/s05.png" alt="05 Écosystème" width="100%">

Les modules pilotés par cette application ont chacun leur dépôt : [Switch Track](https://github.com/Microcoaster/Switch-Track), [Launch Track](https://github.com/Microcoaster/Launch-Track), [Lift Hill](https://github.com/Microcoaster/Lift-Hill), [Module Audio](https://github.com/Microcoaster/Module-Audio), [Smoke Machine](https://github.com/Microcoaster/Smoke-Machine). Le socle commun est le [WiFi Manager](https://github.com/Microcoaster/MicroCoaster_WifiManager).

---

<sub>MicroCoaster · Auteurs : Cybertrist, Yamakajump</sub>
