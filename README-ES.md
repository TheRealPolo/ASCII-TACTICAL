# ASCII-TACTICAL

Un **juego multijugador de disparos tácticos** en tiempo real que se ejecuta completamente en tu terminal. Dos equipos, una bomba, sin piedad. Juega **localmente en LAN** o **globalmente por internet** con descubrimiento automático de salas.

```
┌──────────────────────────────┬─────────────────────────────────────────────┐
│  #############################      Ronda  3 / 16     [FASE COMPRA 18s]    │
│  #........A.......#..........#│  ────────────────────────────────────────  │
│  #....[T].........|..[CT]....#│  TERRORISTAS         CONTRA-TERRORISTAS    │
│  #.................=.........#│  Alice    ♥100  $2500  Bob      ♥100 $2500 │
│  #..............B............#│  Charlie  ♥100  $800   Dave     ♥100 $800  │
│  #############################      ───────────────────────────────────────│
└──────────────────────────────┴─────────────────────────────────────────────┘
```

Inspirado en Counter-Strike. Construido con Node.js puro sin dependencias externas.

---

## Características

- **Combate por equipos** — Terroristas vs Contra-Terroristas, 2–10 jugadores por partida
- **Mecánicas de bomba** — plantar en sitio A o B, desactivar antes de detonación
- **Rondas en tres fases** — Compra → Combate → Resolución, primero a 9 gana (mejor de 16)
- **Sistema de economía** — gana dinero de bajas y objetivos, gástalo en armas y equipamiento
- **Visibilidad** — raycast de Bresenham; muros y cobertura bloquean disparos
- **Movimiento en 8 direcciones** — el posicionamiento táctico importa
- **Mapa ASCII** — diseño táctico 30×20 con dos sitios de bomba, cobertura y zonas de agua
- **HUD en vivo** — panel de estadísticas en tiempo real con dinero, salud, armadura, historial de bajas y marcador

---

## Requisitos

- **Node.js** v14 o posterior
- Una terminal con soporte de color ANSI (cualquier terminal moderna)

---

## Instalación

```bash
git clone https://github.com/TheRealPolo/ASCII-TACTICAL.git
cd ASCII-TACTICAL
```

No se necesita `npm install` — cero dependencias externas.

---

## Ejecutar el juego

### Opción A: Juego local (LAN)

**1. Inicia el servidor** (una ventana de terminal):

```bash
node server.js
# o: node server.js <puerto>   (default: 7777)
```

**2. Conecta cada jugador** (una terminal aparte por jugador):

```bash
node index.js localhost Alice T
node index.js localhost Bob CT
```

### Opción B: Juego global (Multijugador por internet)

**1. Inicia el hub de matchmaking** (en un servidor público, una sola vez):

```bash
node matchmaking.js
# o: node matchmaking.js <puerto>   (default: 7776)
```

**2. Hospeda una sala de juego** (cualquier jugador con IP pública):

```bash
node server.js 7777 --mm mm.tudominio.com --name "Mi Sala"
```

**3. Únete vía navegador de salas** (en cualquier máquina con internet):

```bash
node index.js --mm mm.tudominio.com Alice T
```

Muestra todas las salas en vivo. Navega con `W/S` o `↑/↓`, presiona `ENTER` para entrar, `R` para refrescar, `^C` para salir.

### Conexión directa (IP explícita)

Si conoces la IP del servidor de juego:

```bash
node index.js 192.168.1.100 Alice T
```

### Argumentos

| Argumento | Defecto     | Opciones              |
|-----------|-------------|-----------------------|
| `host`    | `localhost` | cualquier IP o nombre |
| `--mm`    | deshabilitado| servidor matchmaking  |
| `nombre`  | `Jugador`   | cualquier texto       |
| `equipo`  | `auto`      | `T`, `CT`, `auto`     |

El lobby de la partida inicia una cuenta atrás cuando hay 2+ jugadores conectados y se lanza automáticamente.

---

## Controles

| Tecla     | Acción                                      |
|-----------|---------------------------------------------|
| `W A S D` | Movimiento (direcciones cardinales)         |
| `Q / E`   | Girar vista (8 direcciones)                 |
| `Space`   | Disparo                                     |
| `R`       | Recarga                                     |
| `F`       | Plantar bomba (T en A/B) / Desactivar (CT)  |
| `B`       | Alternar menú de compra (solo fase compra)  |
| `1–5`     | Comprar objeto o cambiar arma               |
| `Tab`     | Alternar marcador                           |
| `Ctrl+C`  | Salir                                       |

---

## Flujo de la ronda

```
Fase Compra (20s) → Fase Combate (150s) → Fase Resolución (5s) → siguiente ronda
```

- **Fase Compra:** Compra armas y equipamiento antes de que comience la ronda.
- **Fase Combate:** Los terroristas deben plantar la bomba en el sitio A o B. Los contra-terroristas deben detenerlos.
  - Plantar toma **3 segundos** (párate en el sitio y pulsa `F`).
  - Una vez plantada, la bomba detona después de **30 segundos**.
  - Desactivar toma **5 segundos** (el CT debe completarlo antes de la detonación).
- **Condiciones de victoria:**
  - **T gana** — la bomba detona, o todos los CT son eliminados.
  - **CT gana** — la bomba es desactivada, todos los T son eliminados, o expira el tiempo sin plantar.

---

## Economía

| Evento           | Recompensa|
|------------------|-----------|
| Baja             | +$300     |
| Bomba plantada   | +$400     |
| Bomba desactivada| +$400     |
| Victoria ronda   | +$3,200   |
| Derrota ronda    | +$1,400   |

El dinero tiene un tope de **$16,000**.

### Tienda (fase compra)

| Slot | Objeto         | Costo   | Daño | Cargador | Alcance |
|------|----------------|---------|------|----------|---------|
| 1    | Glock-18       | Gratis  | 18   | 20       | 8       |
| 2    | MP5-SD         | $1,500  | 22   | 30       | 10      |
| 3    | AK-47          | $2,700  | 34   | 30       | 16      |
| 4    | AWP            | $4,750  | 150  | 5        | 30      |
| 5    | Chaleco        | $1,000  | —    | —        | —       |

- **Glock-18** es tu pistola predeterminada gratuita — siempre disponible, sin necesidad de compra.
- **AWP** inflige 150 de daño, suficiente para matar de un disparo incluso con armadura completa.
- **Chaleco** absorbe 50% del daño entrante (hasta 50 puntos).

---

## Leyenda del mapa

| Símbolo | Significado     |
|---------|-----------------|
| `#`     | Muro            |
| `.`     | Piso            |
| `A`     | Sitio de bomba A|
| `B`     | Sitio de bomba B|
| `~`     | Agua (peligro)  |
| `\|`    | Cobertura vert. |
| `=`     | Cobertura horiz.|
| `T`     | Jugador T       |
| `C`     | Jugador CT      |
| `*`     | Bomba           |

La cobertura bloquea tanto el movimiento como la línea de vista.

---

## Estructura del proyecto

```
ASCII-TACTICAL/
├── server.js          # Servidor de juego — estado autorizado, puerto 7777
├── matchmaking.js     # Hub descubrimiento de salas — puerto 7776 (opcional, para juego global)
├── index.js           # Cliente — UI de terminal e entrada
└── src/
    ├── game.js        # Lógica de ronda, condiciones de victoria, entrada de jugador
    ├── combat.js      # Disparos, daño, línea de vista (Bresenham)
    ├── render.js      # Renderizador de terminal ANSI, diseño HUD, navegador de salas
    ├── map.js         # Datos de mapa y consultas espaciales
    ├── player.js      # Factory de jugador y estado
    ├── config.js      # Parámetros de balance (armas, economía, tiempo)
    └── input.js       # Manejador de entrada de teclado raw
```

---

## Protocolo de red

El servidor transmite el estado completo del juego a todos los clientes cada **100 ms** sobre TCP usando JSON delimitado por saltos de línea. El cliente nunca simula la lógica de juego autorizada — todas las decisiones se toman en el servidor.

---

## Multijugador global (Matchmaking)

Para **multijugador en internet**, usa el servidor de matchmaking opcional:

### Cómo funciona

1. **Hub de Matchmaking** (`matchmaking.js`) se ejecuta en una IP pública (ej. VPS, servidor cloud)
   - Puerto: 7776 (configurable)
   - Mantiene una **lista en vivo de salas de juego activas**
   - Los servidores de juego se registran con sus detalles (nombre, conteo de jugadores, estado)
   - Los servidores envían **latido cada 10 segundos** — las salas se vuelven obsoletas después de 35s sin latido

2. **Servidores de juego** se registran en el hub de matchmaking:
   ```bash
   node server.js 7777 --mm matchmaking.tudominio.com --name "Sala de torneo 1"
   ```
   - Funciona incluso detrás de NAT (matchmaking ve la IP de conexión)
   - Se registra automáticamente de nuevo en reconexión

3. **Jugadores** exploran salas disponibles:
   ```bash
   node index.js --mm matchmaking.tudominio.com Alice T
   ```
   - Lista de salas en vivo muestra: nombre, conteo de jugadores, fase actual (lobby/combate)
   - Navega con `W/S` o flechas, `ENTER` para entrar
   - Al seleccionar, el cliente se desconecta de matchmaking y se conecta directamente al servidor de juego

### Por qué este diseño

- **Desacoplado**: Los servidores de juego no dependen del servidor de matchmaking para ejecutarse — si MM cae, los juegos activos continúan
- **Escalable**: Múltiples servidores de juego pueden registrarse con un hub de matchmaking
- **Simple**: Sin lógica compleja de relé o proxy — los jugadores se conectan directamente al servidor de juego
- **Resiliente**: Los servidores se reconectan automáticamente a matchmaking si el hub se reinicia

---

## Desarrollo

### Configuración de desarrollo

No se requiere paso de compilación. Solo edita el código y reinicia el servidor.

**Juego local:**
```bash
# Terminal 1: Servidor
nodemon server.js

# Terminal 2+: Cliente(s)
node index.js localhost Alice T
```

**Testing de multijugador global (en localhost):**
```bash
# Terminal 1: Hub de matchmaking
node matchmaking.js

# Terminal 2: Servidor de juego (se registra con MM)
node server.js 7777 --mm localhost --name "Sala de desarrollo"

# Terminal 3+: Clientes (exploran salas)
node index.js --mm localhost Alice T
node index.js --mm localhost Bob CT
```

---

## Licencia

MIT

---

## Changelog

### v1.0 — Multijugador global
- Añadido **servidor de matchmaking** (`matchmaking.js`) para descubrimiento de salas en internet
- Los servidores de juego se registran con el flag `--mm` y se anuncian globalmente
- **UI de navegador de salas** en el cliente: lista en vivo de partidas activas, navega con `W/S` / `↑/↓`, `ENTER` para entrar
- Los servidores envían latido (heartbeat) cada 10s; las salas obsoletas expiran a los 35s
- Los clientes se conectan directamente al servidor de juego (sin relay — matchmaking solo gestiona el descubrimiento)
- Añadidos flags `--name` y `--host` a `server.js` para nombrar salas y soporte NAT
- **Seguimiento de ping/latencia** mostrado en el HUD (media de los últimos 20 muestreos RTT)
- Scripts `npm run server` / `npm run client` añadidos a `package.json`

### BETAv0.3 — Tienda mejorada y armas de CS
- Se reemplazaron las armas genéricas por el arsenal estilo CS: **Glock-18** (gratis), **MP5-SD**, **AK-47**, **AWP**
- Se añadió un 4.º slot de arma (`smg`); las teclas de cambio de arma ahora van de `1` a `4`
- Menú de tienda rediseñado: muestra si ya posees el arma (✓), pone en gris los artículos ya comprados e integra el atajo para cerrar
- Eliminado el botiquín de la tienda
- Dinero inicial aumentado de $800 a $1.000
- La compra de armadura ahora se bloquea si ya tienes la armadura completa

### BETAv0.2 — Cambio de mapa
- Nuevo diseño de mapa con los puntos de bomba A y B rediseñados

### BETAv0.1 — Lanzamiento inicial
- Multijugador local por TCP (Node.js, sin dependencias)
- T vs CT con fase de compra, fase de combate y mecánica de plantar/desactivar bomba
- Renderizado ASCII en terminal con colores ANSI y línea de apunte
- Movimiento y orientación en 8 direcciones
