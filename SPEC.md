# Guit95 — Specification (Reverse-Engineered)

> Платформо-нейтральная спецификация мультимедийного курса игры на гитаре
> **Guit95** (Ubi Soft, 1995) для воспроизведения нативно на macOS/Web.
>
> Источник: ISO-образ CD `/Volumes/Guitar` (572 МБ, ISO 9660 Joliet),
> приложение `GUITAR.EXE` (16-bit MFC, ~322 КБ).

---

## 1. Обзор системы

### 1.1 Архитектура оригинала

`GUITAR.EXE` — это интерпретатор сценариев, написанных в виде **INI-файлов с
разными расширениями**. Никакой проприетарной бинарщины:

- Все сценарии (`.EXR`, `.SCR`, `.SNG`, `.CHO`, `.TUN`, `.MTR`, `.CHD`, `.SCO`,
  `.TIT`) — это plain text INI.
- Графика — стандартный Windows BMP (8-bit палитра).
- Звук — стандартный WAV (Mono PCM).
- Видео — AVI с кодеками Cinepak / Indeo 3.2 / MS-Video1.
- Анимации `.UBI` — собственный сжатый формат Ubi Soft (8 файлов в `ANIMS/`,
  декоративные фоновые анимации; для функциональности **не критичны**).

### 1.2 Доменная модель

```
Application
├── Document Dictionary        (GUITAR.INI [Documents])
│     "именованные сценарии" → путь к файлу
│
├── Scene (один INI-файл)
│     ├── Background BMP
│     ├── Buttons               (rect + sprite-up/down + действие)
│     ├── Pictures              (динамические оверлеи)
│     ├── Sequences             (стейт-машина из 15 опкодов)
│     └── Specialized windows   (MCI, Score, Chord, FFT)
│
├── Chord Database (.CHD)        ссылка из Scene
│     [chord ×11]               аккорды + сэмплы + кадры в видео
│
├── Score (.SCO)                 ссылка из Song Scene
│     header + [bar] + [event]  синхронизация видео ↔ табулатура
│
└── Global resources
      Tuner, Metronome, Help, Credits, Animations
```

---

## 2. Инвентаризация контента

### 2.1 Песни (6 + 1 «Wild World»)

| Песня              | Папка    | Видео           | Упражнений | Word-экранов | Версии (.SNG) |
| ------------------ | -------- | --------------- | ---------- | ------------ | ------------- |
| Hey Joe            | `HEYJOE` | `HJOE.AVI`  29 МБ | **16**     | 3            | 2             |
| Life by the Drop   | `LIFE`   | `LBTD.AVI`  18 МБ | 7          | 3            | 2             |
| No Woman No Cry    | `WOMAN`  | `NWNC.AVI`  32 МБ | 13         | 4            | 2             |
| Blowin' in the Wind| `BLOWIN` | `BITW.AVI`  20 МБ | 7          | 3            | 2             |
| Dust in the Wind   | `DUST`   | `DITW.AVI`  25 МБ | 9          | 3            | 2             |
| Sweet Home Alabama | `SWEET`  | `SHA.AVI`   28 МБ | 12         | 3            | 2             |
| Wild World         | `WILD`   | `WW.AVI`    27 МБ | 10         | 3            | 2             |

Каждая песня имеет одинаковую структуру подпапок:
`CHORDS/`, `CROSROAD/`, `EXERCICE/{0..N}/`, `PLAY/`, `WORDS/`.

### 2.2 Toolkit (общие упражнения)

10 базовых упражнений в `TOOLKIT/{0..9}/`. Папка `0` — экран-список (entry),
`1..9` — отдельные упражнения (видео `N-1.AVI`, `N-2.AVI`, BMP кадры с
табулатурой, голосовые комментарии `REXN-K.WAV`).

### 2.3 Help / Credits / Intro

- `CREDITS/` — 6 страниц титров (`CREDITS1.EXR`..`CREDITS6.EXR`).
- `HELP/` — 5 разделов: `chords/`, `crossrd/`, `lessons/`, `music/`, `words/`.
- `PRESENT/` — заставки и логотип Ubi Soft.
- `EXIT/`, `TITLE/` — экраны выхода и заголовка.

### 2.4 Глобальные функции

- **Tuner** (`TUNNING/`) — два режима экрана (`TUNNING1.TUN` / `TUNNING2.TUN`),
  FFT-анализ микрофона + 7 эталонных сэмплов струн.
- **Metronome** (`METRONOM/METRO.MTR`) — настраиваемый темп с тиком `TICK.WAV`.

### 2.5 Видео

| AVI         | Размер   | Назначение                |
| ----------- | -------- | ------------------------- |
| `HJOE.AVI`  | 29 МБ    | Hey Joe — main song video |
| `NWNC.AVI`  | 32 МБ    | No Woman                  |
| `SHA.AVI`   | 28 МБ    | Sweet Home Alabama        |
| `WW.AVI`    | 27 МБ    | Wild World                |
| `DITW.AVI`  | 25 МБ    | Dust in the Wind          |
| `BITW.AVI`  | 20 МБ    | Blowin' in the Wind       |
| `LBTD.AVI`  | 18 МБ    | Life by the Drop          |
| `TEAM.AVI`  | 2.3 МБ   | Кредиты «About»           |

> Дополнительно в `TOOLKIT/{1..9}/` лежат маленькие AVI с упражнениями
> (всего 187 видео по всем папкам).

---

## 3. Форматы файлов

> Все файлы — INI с CRLF, кодировка **Windows-1252** (есть символы вроде
> `é`, `è` во французских строках). Имена секций и ключей —
> **case-insensitive**, значения — обычно строки/числа/CSV-кортежи.

### 3.1 Координатная система

Все `rect=X1,Y1,X2,Y2` — в пикселях BMP-фона. Логическое разрешение сцен:
**640×480**. Спрайты кнопок (`rectup`, `rectdn`) указывают позицию в
sprite-atlas BMP того же размера, что и фон (часто двойной высоты или
второго BMP в той же папке).

### 3.2 Scene file (`.EXR`, `.SCR`, `.SNG`, `.CHO`, `.TUN`, `.MTR`, `.TIT`)

```ini
; ─── header ───
BackBmp = .\path\to\back.bmp        ; обязателен
GlobalAnimation = 1                 ; флаг: показывать ли случайные UBI-анимации
SetExercice = 0                     ; (только в EXR) индекс активного упражнения
MetroTick = 88                      ; BPM по умолчанию для метронома
ChordFile = ..\chords\chords.chd    ; (опционально) ссылка на CHD
SongFile = hjoe.sco                 ; (только в SNG) ссылка на SCO
Exercices = HeyJoeEx%i              ; шаблон имени документа упражнения
BackSound1 = path\to\bg.wav         ; фоновый звук на сцене

; ─── любое количество кнопок ───
[<тип-кнопки>]
button = N                          ; внутренний id
name = label
rect = X1,Y1,X2,Y2                  ; зона клика на сцене
rectup = X1,Y1,X2,Y2                ; спрайт «отпущена»
rectdn = X1,Y1,X2,Y2                ; спрайт «нажата»
GoToDoc = DocumentName              ; навигация (опц.)

; ─── оверлеи (динамические картинки) ───
[picture]
picture = N
name = label
position = X1,Y1,X2,Y2
bitmap = path\to\overlay.bmp        ; либо
pictdef = chord <ChordName>         ; ссылка на аккорд из CHD

; ─── стейт-машина ───
[sequence]
sequence = <name>                   ; имя или числовой id
<opcode> = <args>
...
```

#### Типы кнопок (полный словарь)

| Секция                  | Назначение                                                     |
| ----------------------- | -------------------------------------------------------------- |
| `[button]`              | Универсальная (с `GoToDoc`)                                    |
| `[helpbutton]`          | Помощь по контексту                                            |
| `[gobackbutton]`        | Назад / в предыдущую сцену                                     |
| `[switchmodebutton]`    | Переключить вид (страницы words, vertical/horizontal chords)   |
| `[playbutton]`          | Старт воспроизведения песни/упражнения                         |
| `[loopbutton]`          | Зациклить выбранный диапазон                                   |
| `[seekbeginbutton]`     | В начало                                                       |
| `[leftbutton]/[rightbutton]` | Предыдущий / следующий бар или сцена                       |
| `[barbutton]`           | Кликабельная вертикальная панель «упражнения как полосы»      |
| `[listbutton]`          | Кликабельная зона со списком упражнений                        |
| `[exercicebutton]`      | Запустить конкретное упражнение                                |
| `[chordbutton]`         | Кликнуть аккорд (играет сэмпл, подсвечивает диаграмму)         |
| `[metronombutton]`      | Включить/выключить метроном                                    |
| `[volumebutton]`        | Слайдер громкости (через массив `picpos=` для позиций ползунка)|
| `[seqbutton]`           | Запускает sequence (`mouth`, `left`, `right` — навигация по упражнению) |
| `[plusbutton]/[minusbutton]` | (только METRO.MTR) ±BPM                                   |
| `[flashbutton]`         | (только METRO.MTR) Визуальная индикация тика                   |
| `[*StrButton], [*button]` (Abutton, Dbutton, ...) | (только TUN) кнопки струн          |
| `[AllStrButton]`        | (TUN) проиграть все 6 струн подряд                             |

#### `[barbutton].hitrect` (особый формат)

```ini
[barbutton]
rect=0,98,31,449
rectup=...
rectdn=...
hitrect=0,2,31,25 HeyJoeEx1     ; rect внутри панели + куда переходить
sound=%sex1-tit.wav             ; озвучка при наведении/клике
hitrect=0,27,31,47 HeyJoeEx2
sound=%sex2-tit.wav
...
```

`%s` в путях — макрос, разворачиваемый в зависимости от языка/контекста.

#### Sequence — мини-ISA (15 опкодов)

| Opcode                    | Семантика                                                  |
| ------------------------- | ---------------------------------------------------------- |
| `sequence=NAME`           | Метка/начало sequence (специальные имена: `start`, `stay`) |
| `gotoseq=N`               | Безусловный переход к sequence с id N                      |
| `setbtnseq=BTN,SEQ`       | Привязать клик по кнопке BTN к запуску sequence SEQ        |
| `setmciseq=SEQ`           | Когда видео (MCI) дойдёт до конца → запустить sequence SEQ |
| `aviopen=FILE`            | Открыть AVI-файл                                            |
| `aviplay=N`               | Начать воспроизведение (N: 0=normal, 1=...)                |
| `stopall=`                | Остановить всё медиа                                       |
| `playsnd=FILE`            | Проиграть WAV                                              |
| `showpicture=N,V`         | Показать (V=1) / скрыть (V=0) picture с id N               |
| `hideallpictures=1`       | Скрыть все pictures                                        |
| `picturetotop=N`          | Вынести picture N на передний план                         |
| `showbutton=N,V`          | Показать/скрыть кнопку                                     |
| `enablebutton=N,V`        | Включить/выключить кнопку                                  |
| `waitnotify=1`            | Пауза до следующего события (от MCI/звука)                 |
| `wait`                    | Пауза на встроенный интервал                               |

**Стартовые sequence:**
- `start` — выполняется один раз при входе в сцену
- `stay` — выполняется при возврате из вложенной сцены

### 3.3 Chord Database (`.CHD`)

```ini
PictureFile = heyjoe2.bmp           ; общий BMP с диаграммами всех аккордов

[chord]
chord = 0                           ; numeric id (используется в [event].chord и [picture].pictdef)
name = C                            ; ярлык
pic_rect      = 213,17,334,113      ; диаграмма: вертикальный режим
pic_rect_us   = 36,17,157,113       ; диаграмма: «US» (горизонтальный) режим
sco_rect      = 366,8,519,119       ; зона на «партитуре»
E1_rect, A_rect, D_rect, G_rect, B_rect, E2_rect           ; зоны 6 струн (вертик.)
E1_rect_US, ... E2_rect_US                                  ; зоны 6 струн (US)
A = 0 2920                          ; струна A: hit time=0мс, длительность=2920мс
D = 1450 2920                       ; ... (синтаксис «start_ms duration_ms»)
G = 1450 2920
B = 1450 2920
sound = hj_c.wav                    ; основной сэмпл
hand  = c.bmp                       ; close-up рук-фото
avi   = 294                         ; кадр в видео-уроке песни, где играется этот аккорд
comments = DO                       ; описание (французский)
rgbHighlight = 255 0 0              ; цвет подсветки активного аккорда
```

**Hey Joe аккорды:** C, Go (G open), D, A, E, C_3, G_3, D_5, A_5, E_7, E7#9 (11 шт).

### 3.4 Score / Sync File (`.SCO`)

```ini
; ─── header ───
version       = 100
videofile     = \VIDEO\HJOE.AVI
chordfile     = ..\CHORDS\CHORDS.CHD
scorefile     = HEYJ-B2.BMP         ; длинная горизонтальная BMP-табулатура
backfile      = PLAY1.BMP           ; фон сцены
playfile      = HEYJ-B2.BMP         ; видимая часть скроллера
startingframe = 0                   ; начало видео
endingframe   = 2139                ; конец видео
startingpixel = 0                   ; соответствующая позиция в табулатуре
endingpixel   = 14139               ; конец табулатуры

; ─── тактовые линии ───
[bar]
pixel = 110
pixel = 478
pixel = 478
...                                  ; десятки записей (для прыжка по тактам)

; ─── события синхронизации (3000+ записей) ───
[event]
frame = 0                           ; видео-кадр
pixel = 110                         ; соответствующая позиция в табулатуре
chord = 4                           ; (опц.) сменить активный аккорд → подсветить
manual = 1                          ; (опц.) флаг manual-режима

; ─── подсветка трудных мест ───
[difficulty]
sound    = ..\exercice\0\%sex4-tit.wav   ; голосовая подсказка
rect     = 886,65,1130,160               ; зона в координатах табулатуры
index    = 43                            ; порядковый номер
color    = 219,198,129                   ; цвет подсветки
exercice = 4                             ; в какое упражнение прыгнуть при клике
```

Алгоритм воспроизведения:
1. Видео играется с `startingframe` до `endingframe`.
2. Текущий пиксель = линейная интерполяция по `[event]` парам (frame ↔ pixel).
3. Полоса табулатуры скроллится так, чтобы курсор оставался в центре `playfile`.
4. При прохождении event с `chord=K` подсвечивается этот аккорд в `[ChordWindow]`.
5. Клик по `[difficulty].rect` → озвучка + переход в Exercise N.

### 3.5 Tuner (`.TUN`) — DSP-параметры

```ini
[ParamsTunning]
freqin       = 1                    ; вход (микрофон)
buffinlength = 12                   ; длина буфера (в каких-то единицах)
amplitude    = 20                   ; порог
SNRatio      = 50                   ; signal-to-noise threshold
E1_freq = 82.41                     ; эталоны стандартного строя E2 A D G B E4
A_freq  = 110
D_freq  = 146.83
G_freq  = 196.00
B_freq  = 246.94
E2_freq = 329.63
E1_sound = e1.wav   A_sound = a.wav   ...   ; одиночные ноты
E1Str_sound = e1str.wav   ...               ; с боем
AllStr_sound = allstr.wav                   ; все 6 струн
```

UI: `[FftWindow]` (область визуализации спектра), `[FreqWindow]` (цифровой
дисплей частоты, рендер из BMP-цифр через `digit=`), `[TunningMeter]`
(стрелка-индикатор).

### 3.6 Metronome (`.MTR`)

```ini
BackBmp  = chrono.bmp
TickWave = tick.wav                 ; сэмпл тика
[plusbutton]   ...                  ; +1 BPM
[minusbutton]  ...                  ; -1 BPM
[playbutton]   ...                  ; старт/стоп
[flashbutton]  ...                  ; визуальная вспышка на каждом тике
[FreqWindow]   digit=...            ; цифровой дисплей текущего BPM
[xvolumebutton] picpos=...          ; громкость
```

Диапазон BPM не указан явно, но `MetroTick` в сценах = 80–88; разумный
диапазон UI: 30–240 BPM.

---

## 4. Граф навигации

### 4.1 Document Dictionary (`GUITAR.INI [Documents]`)

Точки входа: `Start = present\logoubi.scr` → автоматически переходит на
`Present`, далее `Title1` → главное меню.

Глобальные документы:
```
Start, Present, Logo (error), Exit
Tunning1, Tunning2, Métro
Title1, Title2
Exercice0  (toolkit entry), ToolKit, ToolKitEx1..ToolKitEx9
Credits1..Credits6
HelpTunning1/2, HelpChords, HelpCrossRd, HelpLessons, HelpMusic, HelpWords
```

Per-song (для каждого `<Song>` ∈ {HeyJoe, Life, Woman, Blowin, Dust, Sweet, Wild}):
```
<Song>CrossRd      экран «перекрёстка» — выбор раздела для песни
<Song>Song         основной экран песни (видео + табулатура)
<Song>Song2        альтернативная аранжировка
<Song>Chords       таблица аккордов песни
<Song>Chords2      (опционально) альтернативный набор аккордов
<Song>Words1..N    тексты с подсветкой
<Song>Ex0..N       упражнения (N зависит от песни, см. 2.1)
```

Числовые `GoToDoc=1..15` встречаются только в `HELP/*` сценах — это
переходы между страницами одного help-документа (внутренний пагинатор).

### 4.2 Типичный маршрут пользователя

```
[Start logo Ubi Soft]
   ↓
[Présent]  →  [Title1] (главное меню)
                ├── Tunning1/2  (тюнер)
                ├── Métro       (метроном)
                ├── Toolkit     (общие упражнения)
                ├── HeyJoe →  CrossRd (хаб песни)
                │              ├── Chords
                │              ├── Words 1..3
                │              ├── Song / Song2  (видео+табы)
                │              └── Ex0..15       (упражнения)
                ├── Life ...
                ├── Woman ...
                └── ...
                Credits / Help / Exit
```

### 4.3 Глобальные «фишки»

- `[GlobalAnimations]` в GUITAR.INI: каждые 5–60 сек случайно показывается
  анимация из 8 `.UBI` файлов в позиции `(x1,y1)-(x2,y2)`. Декоративно,
  можно отключить (`GlobalAnimation=0` в сцене).
- `[Keys] chordsetswitch = 67` — клавиша 'C' переключает chord set
  (например, «открытые» ↔ «барре»).

---

## 5. Функциональные возможности

### 5.1 Что есть в оригинале

| Фича                                    | Где           | Реализуемо |
| --------------------------------------- | ------------- | :--------: |
| Видеоурок с синхронизированной табулатурой | Song scene  | ✅ |
| Скролл табулатуры по таймкоду видео     | Song scene    | ✅ |
| Подсветка активного аккорда             | Song scene    | ✅ |
| Кликабельные «трудные места» → упражнение | Song scene  | ✅ |
| Прыжок по тактам ([bar] markers)        | Song scene    | ✅ |
| Прыжок по упражнениям (barbutton)       | Exercise list | ✅ |
| **Loop** — зацикливание секции          | Song/Exercise | ✅ |
| Воспроизведение упражнения с видео + комментарием | Exercise scene | ✅ |
| Двухкадровое сравнение (видео + табы статикой) | Exercise scene | ✅ |
| Полная база аккордов с диаграммами и фото руки | Chords scene | ✅ |
| Аккордовый сэмпл по клику (отдельные струны / бой) | Chords/Tuner | ✅ |
| Запоминание тайминга «когда играется аккорд» в видео | CHD `avi=` | ✅ |
| Метроном с регулировкой BPM             | Метроном      | ✅ |
| Хроматический тюнер (FFT по микрофону)  | Tuner         | ✅ |
| Эталонные ноты по струнам (PCM-сэмплы)  | Tuner         | ✅ |
| Slider громкости                        | везде         | ✅ |
| Подсветка слов в реальном времени       | Words scene   | ⚠ нужно проверить — в `WORDS01.SCR` есть `cursorpos`/`cursorrect`, но событий синхронизации не видно. Возможно, статичные тексты с навигацией страниц. |
| Декоративные глобальные анимации        | везде         | 🟡 Низкий приоритет — `.UBI` формат не разобран. |
| Переключение vertical/horizontal chord view | Chords scene | ✅ Поля `pic_rect` vs `pic_rect_us` |
| Контекстная справка (Help)              | везде         | ✅ |

### 5.2 Чего **нет** в оригинале

- ❌ **Замедление видео** (slow-down). Темп видео фиксирован, упражнения
  записаны на разных скоростях. `MetroTick` влияет только на метроном, не
  на песню.
- ❌ Транспонирование аккордов / табулатуры.
- ❌ Запись/визуализация игры пользователя.
- ❌ Прогресс / «оценки» / «уроки пройдены».

### 5.3 Что **стоит добавить** в новую версию (предложения)

> Эти функции опциональны, обсудить отдельно.

- 🆕 **Slow-down**: AVPlayer / `<video>.playbackRate` поддерживают 0.25×–2×
  без сдвига питча (с PSOLA). Огромная польза для разучивания.
- 🆕 **A↔B Loop**: уже есть `loopbutton`, но без UI-выбора A/B; можно
  добавить выделение диапазона по бар-маркерам.
- 🆕 **Прогресс**: localStorage / Core Data — отметки «упражнение освоено».
- 🆕 **Транспонирование**: аппаратно сложно (видео нельзя переписать), но
  можно перерисовать табы и аккорды для другой тональности.
- 🆕 **Метроном внутри песни**: визуальный «click на тик», синхронный с
  `[bar]` маркерами.
- 🆕 **Фуллскрин на современных разрешениях**: оригинал жёстко 640×480 с
  pixel-art спрайтами; нужна upscale-стратегия (2×/3× nearest или
  векторизованные кнопки поверх растровых фонов).

---

## 6. Контентная карта (для импорта)

Для каждой сцены в системе нужно «знать» её id, тип и пути к ассетам:

```yaml
documents:
  Start:        { type: scene,    file: present/logoubi.scr }
  Present:      { type: scene,    file: present/present.scr }
  Title1:       { type: scene,    file: title/title1.tit }
  Tunning1:     { type: tuner,    file: tunning/tunning1.tun }
  Métro:        { type: metronome,file: metronom/metro.mtr }
  Exercice0:    { type: scene,    file: toolkit/exer0.exr }
  ToolKitEx1:   { type: exercise, file: toolkit/1/tool1.exr }
  HeyJoeCrossRd:{ type: scene,    file: heyjoe/crosroad/crossrd.scr }
  HeyJoeSong:   { type: song,     file: heyjoe/play/heyjoe1.sng }
  HeyJoeChords: { type: chords,   file: heyjoe/chords/chords.cho }
  HeyJoeWords1: { type: words,    file: heyjoe/words/words01.scr }
  HeyJoeEx0:    { type: exercise_list, file: heyjoe/exercice/0/ex0.exr }
  HeyJoeEx1:    { type: exercise, file: heyjoe/exercice/1/ex1.exr }
  ...
```

Полный список из `GUITAR.INI` — ~120 документов (подгружается парсером).

---

## 7. Реализация: рекомендуемая стратегия

### 7.1 Архитектура (платформо-нейтрально)

```
┌──────────────────────────────────────────┐
│  Asset Bundle  (копия CD + конвертация)   │
│   • BMP → PNG (опц.)                      │
│   • AVI → MP4 (H.264)                     │
│   • INI / WAV — как есть                  │
└──────────────────┬───────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  INI Parser          │  ~50 строк
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Document Registry   │  GUITAR.INI [Documents]
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Scene Engine        │
        │   • Background       │
        │   • Buttons (rect)   │
        │   • Pictures         │
        │   • Sequence runner  │  (15-opcode interpreter)
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Specialized players │
        │   • SongPlayer (.SCO)│
        │   • TunerEngine (FFT)│
        │   • Metronome        │
        │   • ChordViewer      │
        └─────────────────────┘
```

### 7.2 Web vs Native macOS — сравнение

| Критерий            | Web (Vite + TS)                        | macOS (SwiftUI)                |
| ------------------- | -------------------------------------- | ------------------------------ |
| Скорость разработки | ⭐⭐⭐ Hot-reload, итерации мгновенные  | ⭐⭐ Xcode, медленнее            |
| Воспроизведение видео | ✅ `<video>` + MP4                    | ✅ AVPlayer                    |
| FFT-тюнер           | ✅ Web Audio + AnalyserNode (HTTPS)   | ✅ AVAudioEngine               |
| Точность метронома  | ⭐⭐ ±5–10 мс (Web Audio)              | ⭐⭐⭐ ±1 мс (CoreAudio)        |
| Деплой              | ✅ Один URL — открыть на iPad/iPhone   | ❌ Только Mac                   |
| BMP support         | ⚠ Конвертить в PNG                     | ✅ Native                       |
| Slow-down видео     | ✅ `playbackRate` + `preservesPitch`   | ✅ `AVPlayer.rate`             |
| Возможность отдать другу | ✅ Просто URL                      | ❌ Нужен подпис. .app           |
| Жёсткий 640×480 скейл | ✅ CSS transform                      | ✅ NSView scale                |

**Рекомендация:** **Web (Vite + TypeScript, без фреймворка)**. Мотивы:

1. Нет смысла в SwiftUI — приложение по сути статичные сцены с кнопками,
   преимуществ нативного UI ноль (вся графика и так bitmap-pixel-perfect
   из 1995).
2. Бонус — открывается на iPad с гитарой в руках без установки.
3. Точность метронома ±10 мс не критична для разучивания (профи
   используют hardware metronomes; для учёбы любой OK).
4. Можно деплоить на GitHub Pages → доступ откуда угодно.

### 7.3 Этапы

| Этап | Задачи                                                   | Оценка    |
| ---- | -------------------------------------------------------- | --------- |
| 0    | Скопировать CD в `assets/`, ffmpeg AVI→MP4, sips BMP→PNG | 30 мин    |
| 1    | INI-парсер + Document Registry                           | 2 ч       |
| 2    | Scene Engine (background + buttons + GoToDoc навигация)  | 4 ч       |
| 3    | Picture / Sequence-runner (15 опкодов)                   | 4 ч       |
| 4    | Song Player: видео + скролл-табулатура + sync events     | 6 ч       |
| 5    | Chord Viewer + samples + horizontal/vertical switch       | 3 ч       |
| 6    | Tuner: Web Audio FFT + цифровой дисплей частоты          | 4 ч       |
| 7    | Metronome: scheduled WebAudio тики + ±BPM                | 2 ч       |
| 8    | Difficulty hotspots + jump в Exercise                    | 2 ч       |
| 9    | (Бонус) Slow-down, A-B Loop UI, прогресс                  | 4 ч       |
|      | **Итого MVP с парой песен**                               | **20–25 ч** |
|      | **Полная функциональность с 7 песнями**                   | **30–40 ч** |

### 7.4 Технические нюансы

- **Кодировка**: парсер INI должен читать как Windows-1252 (есть `é`, `è`,
  `M_é_tro`).
- **Регистр путей**: оригинал — Windows, файлы все в `UPPERCASE`. На
  case-sensitive ФС (macOS APFS обычно case-insensitive, но Web fetch
  case-sensitive!) — лучше прогнать ассеты через `tr 'A-Z' 'a-z'` при
  копировании.
- **Видео-конверсия**: `ffmpeg -i HJOE.AVI -c:v libx264 -preset slow
  -crf 22 -an -c:a aac HJOE.mp4` (звук в этих AVI обычно есть; флаг
  `preservesPitch` для slow-down работает в Safari/Chrome).
- **Звук**: WAV — почти все 8/16-bit Mono PCM, браузеры играют нативно.
- **Большая длинная табулатура**: `HEYJ-B2.BMP` ≈ 14000 пикселей шириной;
  это растровый long-strip. Скролл — простой `transform: translateX(-N)`
  внутри overflow:hidden контейнера.

---

## 8. Открытые вопросы

1. **`.UBI`** анимации — стоит ли разбирать формат? (Влияет только на
   декоративные интерлюдии; можно скипнуть.)
2. **Words sync** — есть ли реально подсветка слов по таймкоду или это
   статичные страницы? (Нужно проверить наличие `[event]` в `.SCR` words.)
3. **ChordSet switching** — как организован переход `Chords ↔ Chords2`?
   Через клавишу 'C' (`chordsetswitch=67`) или через `chordsetbutton`?
4. **`HelpKey` / `HelpPartialKey`** в EXE — есть ли отдельный help-файл с
   контекстной справкой или всё содержится в `HELP/*` сценах?
5. **`waitnotify=1`** — точная семантика: ждать конца текущего звука?
   видео? таймера? Нужно эмпирически определить (или просто наблюдать в
   эмуляторе оригинал).
6. **Кэш палитры**: BMP — 8-bit с палитрой; нужно убедиться, что после
   PNG-конверсии цвета `rgbHighlight` в CHD совпадают с палитрой.

---

## 9. Соответствие лицензии

> Это приложение — **строго для личного использования**.
> Музыкальные произведения (Hey Joe, No Woman No Cry, Sweet Home Alabama,
> Wild World, Blowin' in the Wind, Dust in the Wind, Life by the Drop) и
> видеозаписи — собственность авторов и Ubi Soft (1995).
>
> Допустимо: воссоздание движка, парсера и копия ассетов на собственном
> устройстве для собственного обучения.
>
> Недопустимо: публикация репозитория с ассетами, распространение
> приложения с встроенным контентом, коммерческое использование.

---

*Конец спецификации. Версия 1.0 — реверс-инжиниринг по содержимому CD.*
