# ASCII-TACTICAL

Un **juego multijugador LOCAL** de disparos tácticos en tiempo real que se ejecuta completamente en tu terminal. Dos equipos, una bomba, sin piedad.

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

**1. Inicia el servidor** (una ventana de terminal):

```bash
node server.js
# o: node server.js <puerto>   (default: 7777)
```

**2. Conecta cada jugador** (una terminal aparte por jugador):

```bash
node index.js [host] [nombre] [equipo]
```

| Argumento | Defecto     | Opciones              |
|-----------|-------------|-----------------------|
| `host`    | `localhost` | cualquier IP o nombre |
| `nombre`  | aleatorio   | cualquier texto       |
| `equipo`  | `auto`      | `T`, `CT`, `auto`     |

**Ejemplos:**

```bash
node index.js localhost Alice T
node index.js localhost Bob CT
node index.js 197.000.00.0 Charlie auto
```

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

| Slot | Objeto      | Costo   |
|------|-------------|---------|
| 1    | Pistola     | $500    |
| 2    | Rifle       | $2,500  |
| 3    | Francotirador| $4,700  |
| 4    | Botiquín    | $400    |
| 5    | Chaleco     | $1,000  |

- **Botiquín** restaura 50 HP.
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
├── index.js           # Cliente — UI de terminal e entrada
└── src/
    ├── game.js        # Lógica de ronda, condiciones de victoria, entrada de jugador
    ├── combat.js      # Disparos, daño, línea de vista (Bresenham)
    ├── render.js      # Renderizador de terminal ANSI, diseño HUD
    ├── map.js         # Datos de mapa y consultas espaciales
    ├── player.js      # Factory de jugador y estado
    ├── config.js      # Parámetros de balance (armas, economía, tiempo)
    └── input.js       # Manejador de entrada de teclado raw
```

---

## Protocolo de red

El servidor transmite el estado completo del juego a todos los clientes cada **100 ms** sobre TCP usando JSON delimitado por saltos de línea. El cliente nunca simula la lógica de juego autorizada — todas las decisiones se toman en el servidor.

---

## Desarrollo

MIRA EL README.md EN INGLÉS.

Un desarrollador debería saber inglés técnico.

---

## Licencia

MIT
