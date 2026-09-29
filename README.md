# Show MMR for Minify

**[English](#en)** · **[Русский](#ru)** · **[简体中文](#zh)** · **[Español](#es)** · **[Português (Brasil)](#pt)**

![Show MMR match history](docs/match-history.png)

<a name="en"></a>

## English

A [Minify](https://github.com/Egezenn/dota2-minify) port of AveYo's
[ShowMMR](https://github.com/AveYo/ShowMMR) Dota 2 mod. It records your ranked
MMR after every match and shows `MMR (change)` next to each ranked game in your
match history, and the change on the last-match badge.

Development build: normal ranked captures and restart persistence work live;
early-leave recovery and exact match identity are still open
([open questions](docs/open-questions.md)).

### Requirements

- Dota 2 with Dota 2 Workshop Tools (Minify compiles Panorama JS/XML with them)
- Minify 1.14rc6 (the version this build is tested with)

### Install

1. Copy `Minify/mods/Show MMR` into your Minify `mods` folder.
2. Close Dota, open Minify, enable **Show MMR** and click **Patch**.
3. Start Dota with Minify's launch options.

When upgrading, replace the whole `Show MMR` folder.

### Use

Play ranked as usual. After each match, while you are idle on the dashboard, the
mod briefly opens your match history, reads the new MMR and saves the result.
The first visit on an account only saves a starting point (baseline); results
are recorded from the next ranked match on.

**Settings > Show MMR** shows the account, baseline, what recording is doing,
saved matches, the last result and the net change over the last 24 hours. It has:

- **Refresh from history**: check for a new result now.
- **Start new baseline**: only enabled when a conflict or an MMR change without a
  match has paused recording; clears that pause and keeps your history.
- **Show MMR in match results** and **Record results automatically**, saved per account.

The settings page follows Minify's output language: English, Russian, Simplified
Chinese, Spanish and Brazilian Portuguese.

History is kept per account (newest 100 matches) in Dota's controller slot 3
key bindings:

```text
C:\Program Files (x86)\Steam\userdata\<account_id>\570\local\cfg\user_keys_0_slot3.vcfg
```

### Troubleshooting

- **Nothing shows:** check Show MMR is enabled in Minify and patch again. Rows
  without a saved result keep Dota's normal Win/Loss text.
- **Recording paused:** use **Start new baseline** in Settings.
- **Logs:** search Dota's `console.log` (launch with `-condebug`) for `[ShowMMR]`.
- Missed games, recalibration or a crash can leave gaps; the mod never invents a
  missing result.
- `tools/clear_show_mmr_data.ps1` removes the mod's saved data (with a backup;
  supports `-WhatIf`). It is never needed for install or upgrade.

<a name="ru"></a>

## Русский

Порт мода ShowMMR от AveYo для [Minify](https://github.com/Egezenn/dota2-minify).
Он записывает ваш рейтинговый MMR после каждого матча и показывает `MMR (изменение)`
рядом с каждой рейтинговой игрой в истории матчей, а изменение — на значке
последнего матча.

Тестовая сборка: обычная запись рейтинговых матчей и сохранение после перезапуска
работают; восстановление после досрочного выхода пока не доказано.

### Требования

- Dota 2 с установленными Dota 2 Workshop Tools (Minify собирает ими Panorama JS/XML)
- Minify 1.14rc6 (версия, на которой проверена сборка)

### Установка

1. Скопируйте `Minify/mods/Show MMR` в папку `mods` вашего Minify.
2. Закройте Dota, откройте Minify, включите **Show MMR** и нажмите **Patch**.
3. Запустите Dota с параметрами запуска Minify.

При обновлении заменяйте всю папку `Show MMR`.

### Использование

Играйте рейтинг как обычно. После каждого матча, пока вы в главном меню и ничего
не ищете, мод ненадолго открывает историю матчей, читает новый MMR и сохраняет
результат. Первое посещение на аккаунте сохраняет только точку отсчёта; результаты
записываются начиная со следующего рейтингового матча.

**Настройки > Show MMR** показывают аккаунт, точку отсчёта, состояние записи,
число сохранённых матчей, последний результат и изменение за 24 часа. Там есть:

- **Обновить из истории**: проверить новый результат сейчас.
- **Начать новую точку отсчёта**: доступна только если запись приостановлена из-за
  конфликта или изменения MMR без матча; снимает паузу и сохраняет историю.
- **Показывать MMR в результатах матчей** и **Записывать результаты автоматически**
  — сохраняются для каждого аккаунта.

Язык страницы настроек берётся из выходного языка Minify: английский, русский,
упрощённый китайский, испанский и бразильский португальский.

История хранится отдельно для каждого аккаунта (последние 100 матчей) в
привязках геймпада Dota, слот 3:

```text
C:\Program Files (x86)\Steam\userdata\<account_id>\570\local\cfg\user_keys_0_slot3.vcfg
```

### Если что-то не работает

- **Ничего не отображается:** проверьте, что Show MMR включён в Minify, и сделайте
  Patch ещё раз. Игры без сохранённого результата показывают обычные «Победа/Поражение».
- **Запись приостановлена:** нажмите **Начать новую точку отсчёта** в настройках.
- **Логи:** ищите `[ShowMMR]` в `console.log` Dota (запуск с `-condebug`).
- Пропущенные игры, перекалибровка или вылет могут оставить пробелы; мод никогда
  не придумывает недостающий результат.
- `tools/clear_show_mmr_data.ps1` удаляет сохранённые данные мода (с резервной
  копией; поддерживает `-WhatIf`). Для установки и обновления он не нужен.

<a name="zh"></a>

## 简体中文

AveYo 的 ShowMMR Dota 2 模组的 [Minify](https://github.com/Egezenn/dota2-minify) 移植版。
它会在每场比赛后记录你的天梯 MMR，并在比赛记录中每场天梯比赛旁显示 `MMR（变化）`，
在上一场比赛徽章上显示变化值。

开发版：普通天梯比赛的记录和重启后保留已经可用；提前退出后的恢复尚未验证。

### 要求

- 安装了 Dota 2 Workshop Tools 的 Dota 2（Minify 用它编译 Panorama JS/XML）
- Minify 1.14rc6（本版本测试所用的版本）

### 安装

1. 将 `Minify/mods/Show MMR` 复制到 Minify 的 `mods` 文件夹。
2. 关闭 Dota，打开 Minify，启用 **Show MMR** 并点击 **Patch**。
3. 使用 Minify 的启动选项启动 Dota。

升级时请替换整个 `Show MMR` 文件夹。

### 使用

照常进行天梯比赛。每场比赛结束后，当你在主界面空闲时，模组会短暂打开比赛记录，
读取新的 MMR 并保存结果。账号第一次访问只会保存一个基准，从下一场天梯比赛开始记录结果。

**设置 > Show MMR** 显示账号、基准、记录状态、已保存的比赛数、上一场结果和最近
24 小时的净变化。其中包括：

- **从比赛记录刷新**：立即检查新结果。
- **重新设定基准**：仅在因冲突或无比赛的 MMR 变化而暂停记录时可用；解除暂停并保留历史记录。
- **在比赛结果中显示 MMR** 和 **自动记录结果**，按账号保存。

设置页面的语言跟随 Minify 的输出语言：英语、俄语、简体中文、西班牙语和巴西葡萄牙语。

历史记录按账号保存（最近 100 场），位于 Dota 手柄槽位 3 的键位绑定中：

```text
C:\Program Files (x86)\Steam\userdata\<account_id>\570\local\cfg\user_keys_0_slot3.vcfg
```

### 故障排除

- **没有显示：** 确认 Minify 中已启用 Show MMR，然后重新 Patch。没有保存结果的比赛仍显示 Dota 原本的胜/负。
- **记录已暂停：** 在设置中点击 **重新设定基准**。
- **日志：** 在 Dota 的 `console.log`（使用 `-condebug` 启动）中搜索 `[ShowMMR]`。
- 漏记的比赛、重新定级或崩溃可能留下空缺；模组从不编造缺失的结果。
- `tools/clear_show_mmr_data.ps1` 会删除模组保存的数据（带备份，支持 `-WhatIf`）。安装和升级都不需要它。

<a name="es"></a>

## Español

Adaptación del mod ShowMMR de AveYo para [Minify](https://github.com/Egezenn/dota2-minify).
Registra tu MMR clasificatorio después de cada partida y muestra `MMR (cambio)` junto
a cada partida clasificatoria de tu historial, y el cambio en la insignia de la
última partida.

Versión de desarrollo: el registro normal de partidas clasificatorias y la
persistencia tras reiniciar funcionan; la recuperación tras salir antes de tiempo
aún no está comprobada.

### Requisitos

- Dota 2 con Dota 2 Workshop Tools (Minify compila Panorama JS/XML con ellas)
- Minify 1.14rc6 (la versión con la que se probó)

### Instalación

1. Copia `Minify/mods/Show MMR` en la carpeta `mods` de Minify.
2. Cierra Dota, abre Minify, activa **Show MMR** y pulsa **Patch**.
3. Inicia Dota con las opciones de lanzamiento de Minify.

Al actualizar, reemplaza toda la carpeta `Show MMR`.

### Uso

Juega clasificatorias como siempre. Después de cada partida, mientras estás
inactivo en el menú principal, el mod abre brevemente tu historial, lee el nuevo
MMR y guarda el resultado. La primera visita en una cuenta solo guarda una
referencia; los resultados se registran a partir de la siguiente partida clasificatoria.

**Ajustes > Show MMR** muestra la cuenta, la referencia, lo que está haciendo el
registro, las partidas guardadas, el último resultado y el cambio neto de las
últimas 24 horas. Incluye:

- **Actualizar desde el historial**: busca un resultado nuevo ahora.
- **Iniciar nueva referencia**: solo se activa cuando un conflicto o un cambio de
  MMR sin partida ha pausado el registro; quita la pausa y conserva el historial.
- **Mostrar MMR en los resultados de las partidas** y **Registrar resultados
  automáticamente**, guardados por cuenta.

La página de ajustes usa el idioma de salida de Minify: inglés, ruso, chino
simplificado, español y portugués de Brasil.

El historial se guarda por cuenta (las 100 partidas más recientes) en las
asignaciones del mando de Dota, ranura 3:

```text
C:\Program Files (x86)\Steam\userdata\<account_id>\570\local\cfg\user_keys_0_slot3.vcfg
```

### Solución de problemas

- **No se muestra nada:** comprueba que Show MMR esté activado en Minify y vuelve a
  pulsar Patch. Las partidas sin resultado guardado mantienen el texto normal de Victoria/Derrota.
- **Registro en pausa:** usa **Iniciar nueva referencia** en Ajustes.
- **Registros:** busca `[ShowMMR]` en el `console.log` de Dota (inicia con `-condebug`).
- Las partidas perdidas, una recalibración o un cierre inesperado pueden dejar
  huecos; el mod nunca inventa un resultado que falta.
- `tools/clear_show_mmr_data.ps1` borra los datos guardados del mod (con copia de
  seguridad; admite `-WhatIf`). No hace falta para instalar ni actualizar.

<a name="pt"></a>

## Português (Brasil)

Adaptação do mod ShowMMR de AveYo para o [Minify](https://github.com/Egezenn/dota2-minify).
Registra seu MMR ranqueado após cada partida e mostra `MMR (variação)` ao lado de
cada jogo ranqueado no seu histórico, e a variação no emblema da última partida.

Versão de desenvolvimento: o registro normal de partidas ranqueadas e a
persistência após reiniciar funcionam; a recuperação após sair antes do fim
ainda não foi comprovada.

### Requisitos

- Dota 2 com Dota 2 Workshop Tools (o Minify compila Panorama JS/XML com elas)
- Minify 1.14rc6 (a versão com que esta build foi testada)

### Instalação

1. Copie `Minify/mods/Show MMR` para a pasta `mods` do Minify.
2. Feche o Dota, abra o Minify, ative **Show MMR** e clique em **Patch**.
3. Inicie o Dota com as opções de inicialização do Minify.

Ao atualizar, substitua a pasta `Show MMR` inteira.

### Uso

Jogue ranqueadas normalmente. Após cada partida, enquanto você está ocioso no menu
principal, o mod abre rapidamente seu histórico, lê o novo MMR e salva o resultado.
A primeira visita em uma conta salva apenas uma referência; os resultados são
registrados a partir da próxima partida ranqueada.

**Configurações > Show MMR** mostra a conta, a referência, o que o registro está
fazendo, as partidas salvas, o último resultado e a variação das últimas 24 horas. Inclui:

- **Atualizar pelo histórico**: procura um novo resultado agora.
- **Iniciar nova referência**: só fica ativo quando um conflito ou uma mudança de
  MMR sem partida pausou o registro; remove a pausa e mantém o histórico.
- **Mostrar MMR nos resultados das partidas** e **Registrar resultados
  automaticamente**, salvos por conta.

A página de configurações segue o idioma de saída do Minify: inglês, russo, chinês
simplificado, espanhol e português do Brasil.

O histórico é salvo por conta (as 100 partidas mais recentes) nos atalhos do
controle do Dota, slot 3:

```text
C:\Program Files (x86)\Steam\userdata\<account_id>\570\local\cfg\user_keys_0_slot3.vcfg
```

### Solução de problemas

- **Nada aparece:** confira se o Show MMR está ativado no Minify e clique em Patch
  de novo. Jogos sem resultado salvo mantêm o texto normal de Vitória/Derrota.
- **Registro pausado:** use **Iniciar nova referência** nas Configurações.
- **Logs:** procure `[ShowMMR]` no `console.log` do Dota (inicie com `-condebug`).
- Jogos perdidos, recalibração ou travamentos podem deixar lacunas; o mod nunca
  inventa um resultado que falta.
- `tools/clear_show_mmr_data.ps1` apaga os dados salvos do mod (com backup; aceita
  `-WhatIf`). Não é necessário para instalar ou atualizar.

---

## More / Подробнее

- [How it works](docs/how-it-works.md): capture rules, storage format, manual test data
- [Development](docs/development.md): tests, logs, Dota+ probe
- [Storage ideas](docs/storage-ideas.md): unimplemented designs for larger storage

```text
Minify/mods/Show MMR/   the mod, exactly as Minify installs it
tests/                  regression tests (no Dota needed)
tools/                  data cleanup and optional development log collector
docs/                   documentation
```

MIT, see `LICENSE`. Original project: https://github.com/AveYo/ShowMMR
