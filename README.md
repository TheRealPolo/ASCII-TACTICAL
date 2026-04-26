# ASCII Tactical

Un juego de disparos táctico multijugador estilo **Counter-Strike 2**, completamente renderizado en ASCII en la terminal. Desarrollado con **Node.js puro** sin dependencias externas, combina mecánicas de juego clásicas con una estética retro y minimalista.

## 🎮 Características principales

- **Gameplay competitivo**: Dos equipos (Terroristas vs Contra-terroristas) compiten en rondas tácticas
- **Sistema de economía**: Gana dinero por eliminar enemigos, plantar/desactivar bombas y ganar rondas. Usa el dinero para comprar mejores armas y equipo
- **Mecánicas de combate realistas**: Línea de visión mediante raycasting, armas con alcance y munición limitada, armadura que absorbe daño
- **Servidor autoridad**: Arquitectura cliente-servidor TCP. El servidor valida cada acción
- **Multijugador local**: 2-10 jugadores en la misma red WiFi
- **Interfaz en terminal**: UI en tiempo real mostrando mapa, inventario, estadísticas y eventos

---

## ⚙️ Requisitos

- **Node.js** versión 14 o superior
- **Terminal/CMD** con soporte ANSI (cualquier terminal moderna funciona)
- **Misma red WiFi** para jugar con amigos (o misma PC para pruebas)

[Descargar Node.js](https://nodejs.org)

---

## 📥 Instalación

### 1. Clona o descarga el proyecto

```bash
git clone https://github.com/tuusuario/ascii-tactical.git
cd ascii-tactical
```

O descarga el ZIP y extrae.

### 2. No necesitas instalar dependencias

Este proyecto **no tiene dependencias externas**. Node.js viene con todo lo necesario.

---

## 🚀 Cómo jugar

### Opción A: Mismo PC (para probar)

**Terminal 1 - Inicia el servidor:**
```bash
npm run server
```

**Terminal 2 - Primer jugador:**
```bash
npm run client
```

**Terminal 3 - Segundo jugador:**
```bash
npm run client
```

Ambos se conectan a `localhost` automáticamente.

---

### Opción B: Diferentes PCs en la misma WiFi (recomendado)

#### Paso 1: Encuentra la IP del servidor

**Windows (PowerShell):**
```powershell
ipconfig
```
Busca `IPv4 Address` (ej: `192.168.0.50`)

**Mac/Linux (Terminal):**
```bash
ifconfig
```
Busca `inet` (ej: `192.168.0.50`)

#### Paso 2: Una persona inicia el servidor

En la PC del servidor:
```bash
npm run server
```

Verá:
```
=== ASCII TACTICAL SERVER ===
Escuchando en puerto 7777
Mínimo 2 jugadores para iniciar
```

#### Paso 3: Los demás se conectan

En cada otra PC, reemplaza `192.168.0.50` con la IP del servidor:

```bash
node index.js 192.168.0.50 "Tu Nombre" auto
```

Ejemplos:
```bash
node index.js 192.168.0.50 "Jugador1" T
node index.js 192.168.0.50 "Jugador2" CT
node index.js 192.168.0.50 "Jugador3" auto
```

**Parámetros:**
- `192.168.0.50` → IP del servidor (tu máquina local)
- `"Tu Nombre"` → Tu nombre en el juego (máx 16 caracteres)
- `auto` / `T` / `CT` → Equipo preferido (auto = asignación automática)

---

## 🎮 Cómo se juega

### Objetivo del juego

**Terroristas (T):**
- Uno de ustedes tiene la bomba (*)
- Deben plantarla en el sitio A o B
- Defender la bomba hasta que explote (30 segundos después de plantarla)

**Contra-Terroristas (CT):**
- Defender los sitios A y B
- Desactivar la bomba si es plantada
- Eliminar a todos los Terroristas

### Fases de una ronda

1. **Fase de compra (20 segundos)**
   - Todos los jugadores compran armas y equipo
   - Mínimo 2 jugadores para comenzar
   - Cuenta regresiva de 50 segundos desde que hay suficientes jugadores

2. **Fase de combate (150 segundos máximo)**
   - Los jugadores se mueven y luchan
   - Los Terroristas pueden plantar la bomba
   - Los Contra-Terroristas pueden desactivarla
   - Si la bomba se planta, cuenta regresiva de 30 segundos

3. **Fase de resultado (5 segundos)**
   - Se muestra quién ganó la ronda
   - Se reparten recompensas de dinero
   - Comienza la siguiente ronda

### Sistema de economía

**Ganas dinero por:**
- Eliminar un enemigo: +$300
- Plantar la bomba: +$400
- Desactivar la bomba: +$400
- Ganar una ronda (tu equipo): +$3200
- Perder una ronda (tu equipo): +$1400

**Dinero inicial:** $800 por ronda

**Dinero máximo:** $16,000

### Armas y equipo

**Armas (presiona números 1/2/3 para cambiar):**

| Arma | Precio | Daño | Alcance | Munición | Recarga | Cadencia |
|------|--------|------|---------|----------|---------|----------|
| Pistola | $500 | 15 | 15 tiles | 12/60 | 1.5s | 0.4s |
| Rifle | $2500 | 30 | 25 tiles | 30/90 | 2.2s | 0.6s |
| Sniper | $4700 | 85 | 40 tiles | 5/30 | 3s | 1.5s |

**Equipo:**
- **Chaleco**: $1000 → +50 armadura (absorbe la mitad del daño)
- **Botiquín**: $400 → +50 salud (máx 100)

---

## ⌨️ Controles

| Tecla | Acción |
|-------|--------|
| **W / A / S / D** | Mover (arriba, izquierda, abajo, derecha) |
| **Q / E** | Rotar vista (izquierda / derecha) |
| **ESPACIO** | Disparar |
| **R** | Recargar arma |
| **1 / 2 / 3** | Cambiar arma (si la tienes) |
| **B** | Abrir/cerrar tienda (solo en fase de compra) |
| **F** | Plantar bomba (Terroristas) / Desactivar bomba (Contra-terroristas) |
| **TAB** | Ver estadísticas de todos los jugadores |
| **Ctrl + C** | Salir del juego |

---

## 🎯 Guía de estrategia

### Para Terroristas

1. **Organiza tu equipo**
   - El portador de la bomba es la prioridad máxima
   - Los demás lo protegen en el camino a A o B

2. **Elige sitio**
   - Sitio A: arriba a la izquierda
   - Sitio B: arriba a la derecha
   - Coordina con tu equipo antes de ir

3. **Planta la bomba**
   - Llega al sitio con el portador
   - Presiona F para comenzar a plantar (3 segundos)
   - No te muevas mientras plantas
   - Una vez plantada, defiende por 30 segundos

4. **Economía**
   - Si pierdes muchas rondas, tienes poco dinero
   - A veces es mejor hacer "eco" (comprar poco) para ahorrar

### Para Contra-Terroristas

1. **Posiciónate defensivamente**
   - Cubre ambos sitios (A y B)
   - Mantén línea de visión a los Terroristas

2. **Elimina la amenaza**
   - Identifica quién tiene la bomba (en el HUD)
   - Prioriza al portador

3. **Desactiva si es necesario**
   - Si plantan en tu sitio, acércate
   - Presiona F para desactivar (5 segundos)
   - Protege al desactivador

---

## 📊 Interfaz del juego

### HUD (Cabeza arriba)

```
[RONDA 1/16] T 3/3  CT 3/3  Marcador T 0:0 CT  Fase: COMBATE  Tiempo: 2:30

[YO] Tu Nombre (T)  Salud 100/100  Armadura 50  VIVO
Arma Rifle  Munición 25/90  Pos (15,10)  Mirada N ^  Dinero $2500
Objetivo: PLANTA LA BOMBA EN A o B (F)

— TIENDA — (cierra con B)
  [1] Pistola $500   [2] Rifle $2500   [3] Sniper $4700
  [4] Chaleco $1000   [5] Botiquin $400

— Eventos —
  [KILL] Jugador1 eliminó a Jugador2 con Rifle
  [BOMBA] Jugador1 comienza a plantar en A...
  
— Estadísticas —
  Jugador1        T   K 2  D 1  Salud 85   Rifle    $1200  <- yo
  Jugador2        CT  K 0  D 2  Salud 0    Pistola  $800
  Jugador3        CT  K 1  D 1  Salud 100  Rifle    $2100
```

### Mapa

```
##############################
#............................#
#............................#
#............................#
#......#####.......#####.....#
#......#...#.......#...#.....#
#...A..#...#.......#...#..B..#
#......#...#.......#...#.....#
#......#####.......#####.....#
#............................#
#............~~~~............#
#............~~~~............#
#............................#
#......===.........===.......#
#............................#
#............................#
#............................#
#............................#
#............................#
##############################
```

**Leyenda:**
- `#` = Pared (bloquea movimiento y visión)
- `.` = Piso (transitable)
- `A` / `B` = Sitios de bomba
- `~` = Agua (bloquea movimiento, no visión)
- `|` / `=` = Cobertura (bloquea movimiento y visión)
- `T` = Terrorista (rojo)
- `C` = Contra-Terrorista (cian)
- `*` = Bomba

---

## 🐛 Troubleshooting

### "No se pudo conectar al servidor"
- Verifica que el servidor esté corriendo (`npm run server`)
- Comprueba la IP correcta con `ipconfig` (Windows) o `ifconfig` (Mac/Linux)
- Asegúrate de estar en la misma red WiFi

### "Este cliente necesita ejecutarse en una terminal interactiva"
- No puedes jugar en IDEs como VS Code integrado
- Abre una terminal/CMD normal: PowerShell, Git Bash, Terminal, etc.

### El juego se ve roto/confuso
- Agranda la ventana de la terminal (necesita ~100x30 caracteres mínimo)
- Usa una terminal moderna (Windows Terminal, iTerm2, GNOME Terminal, etc.)

### Lag o desincronización
- Asegúrate de buena conexión WiFi
- El servidor debe estar en una máquina estable
- No ejecutes programas pesados simultáneamente

---

## 📝 Configuración avanzada

Puedes editar `src/config.js` para cambiar:

**Armas:**
```javascript
const WEAPONS = {
  pistol: { range: 15, damage: 15, magazine: 12, ... },
  rifle:  { range: 25, damage: 30, magazine: 30, ... },
  sniper: { range: 40, damage: 85, magazine: 5, ... },
};
```

**Economía:**
```javascript
const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  plantReward: 400,
  // ... más opciones
};
```

**Tiempos de ronda:**
```javascript
const ROUND = {
  buyTimeMs: 20000,      // 20 segundos para comprar
  combatTimeMs: 150000,  // 150 segundos de combate
  bombFuseMs: 30000,     // 30 segundos para que explote
};
```
Diviértete jugando! 🎮**

Para reportar bugs o sugerencias, abre un issue en GitHub.
