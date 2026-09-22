<div align="center">

<p>
  <a href="README.md"><img src="docs/langues/fr-off.png" alt="Lire cette page en français" width="150" /></a>
  <img src="docs/langues/en-on.png" alt="English, page shown" width="150" />
</p>

<img src="docs/en/banniere.png" alt="MicroCoaster WebApp, the web control application" width="100%">

</div>

The web application that drives MicroCoaster layouts. It discovers the connected ESP32 modules, shows their state in real time, and lets you build sequences that orchestrate a whole layout.

Live at **[app.microcoaster.com](https://app.microcoaster.com)**.

<img src="docs/en/sections/s01.png" alt="01 Architecture" width="100%">

The application talks to two worlds that do not have the same needs, so it uses two separate channels.

<img src="docs/en/schemas/architecture.png" alt="Browsers talk to the application over Socket.io, which brings automatic reconnection, a long-polling fallback and one room per user. There they find the connected modules, realtime telemetry, sequence building, accounts and notifications. The ESP32 modules talk over raw WebSocket, in short JSON messages with authentication on connect: Switch Track, Launch Track, Lift Hill, Audio module, Smoke Machine and the simulators. At the centre, the WebApp in Node.js, Express and MySQL is the only one that knows the full state of the layout." width="100%">

**Socket.io towards the browsers.** Automatic reconnection, a long-polling fallback, one room per user. It is comfortable on the web side and it tolerates a temperamental network.

**Raw WebSocket towards the ESP32s.** No extra layer, no transport negotiation: a microcontroller has neither the memory nor the need for a Socket.io client. The modules authenticate on connection, then exchange short JSON messages.

This is also where the system's authority sits. A module never decides to move on its own: it carries out an order from this application, which is the only one that knows the full state of the layout.

<img src="docs/en/sections/s02.png" alt="02 Structure" width="100%">

<img src="docs/en/schemas/arborescence.png" alt="Repository tree. api: the event handlers, modules, users, notifications. websocket: the link to the ESP32 modules. bdd: data access, one DAO per entity. routes: the HTTP routes. middleware: authentication and access control. views: the page templates. public: the assets served as they are. locales: the interface translations. sql: the schema and the seed data. esp: the reference firmwares for the modules. sim: the module simulators, to develop without hardware. tests: the automated tests. utils: the shared helpers." width="100%">

The `sim/` folder deserves a word: it holds simulators that pass themselves off as real modules. You develop and test the orchestration of a complete layout without having to wire anything at all.

<img src="docs/en/sections/s03.png" alt="03 Installation" width="100%">

```bash
git clone https://github.com/Microcoaster/MicroCoasterWebApp.git
cd MicroCoasterWebApp
npm install
cp .env.example .env
```

Fill in `.env`, then create the database:

```bash
mysql -u root -p < sql/schema.sql
mysql -u root -p < sql/default_data.sql
```

<img src="docs/en/sections/s04.png" alt="04 Development" width="100%">

```bash
npm start           # start
npm test            # tests
npx eslint .        # static analysis
```

The cycle is the organisation's: an issue describes the work, a branch starts from `develop`, a pull request comes back onto it and goes through review before reaching `main`.

<img src="docs/en/sections/s05.png" alt="05 Ecosystem" width="100%">

The modules driven by this application each have their own repository: [Switch Track](https://github.com/Microcoaster/Switch-Track), [Launch Track](https://github.com/Microcoaster/Launch-Track), [Lift Hill](https://github.com/Microcoaster/Lift-Hill), [Audio module](https://github.com/Microcoaster/Module-Audio), [Smoke Machine](https://github.com/Microcoaster/Smoke-Machine). The common base is the [WiFi Manager](https://github.com/Microcoaster/MicroCoaster_WifiManager).

---

<sub>MicroCoaster · Authors: Cybertrist, Yamakajump</sub>
