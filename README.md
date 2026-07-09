# Wild Events

**Wild Events** — расширение для SillyTavern, которое автоматически вводит нарративные события в историю через систему накопительного напряжения и бросок кубика. Чем дольше история идёт без потрясений, тем выше шанс на сюжетный поворот — и тем значительнее он будет.

---

## Содержание

1. [Как это работает](#как-это-работает)
2. [Система напряжения](#система-напряжения)
3. [Бросок и расчёт результата](#бросок-и-расчёт-результата)
4. [Уровни событий](#уровни-событий)
5. [Что инжектируется в контекст](#что-инжектируется-в-контекст)
6. [Интерфейс](#интерфейс)
7. [Настройки](#настройки)
8. [Полный список событий по категориям](#полный-список-событий-по-категориям)

---

## Как это работает

1. Каждый раз когда вы отправляете сообщение (`MESSAGE_SENT`), напряжение растёт на заданное значение.
2. Бросается d20, к результату добавляется модификатор на основе текущего напряжения.
3. Итоговый результат определяет уровень события: от NO CHANGE до GIANT PLOT TWIST.
4. Из пула нарративных шаблонов выбирается случайный тип события и тональность (позитив/негатив).
5. Всё это инжектируется в контекст чата как системная инструкция для основной модели.
6. При реролле (`MESSAGE_SWIPED`) событие пересчитывается без увеличения напряжения.
7. При смене чата напряжение и последний результат сбрасываются.

---

## Система напряжения

Напряжение хранится в метаданных чата (`chatMetadata.wild_events_tension`) и **сохраняется между сессиями**.

- Начальное значение: `0%`
- Максимум: `100%`
- Каждое сообщение пользователя: `+step%` (по умолчанию `+0.5%`)
- При событии **MAJOR PLOT TWIST**: напряжение снижается до `75%` от текущего значения
- При событии **GIANT PLOT TWIST**: напряжение сбрасывается в `0%`
- При **принудительном** событии (tension = 100%): финальный счёт фиксируется на `25`, событие всегда GIANT
- Кнопка **Reset Tension**: сбрасывает напряжение в `0%` вручную

Прогресс-бар в UI отображает текущее напряжение от 0 до 100%.

---

## Бросок и расчёт результата

```
baseRoll  = случайное число от 1 до 20 (d20)
modifier  = floor(tension / 8)
finalScore = baseRoll + modifier

isPositive = (baseRoll % 2 === 0)  ← чётный бросок = позитив
```

**Примеры при разном напряжении:**

| Напряжение | Модификатор | Минимальный итог | Максимальный итог |
|-----------|------------|-----------------|------------------|
| 0% | +0 | 1 | 20 |
| 40% | +5 | 6 | 25 |
| 80% | +10 | 11 | 30 |
| 100% | FORCED | 25 (фикс.) | 25 (фикс.) |

---

## Уровни событий

| Итоговый счёт | Уровень | Эффект на напряжение |
|-------------|---------|----------------------|
| 1–10 | **NO CHANGE** | Без изменений |
| 11–14 | **SUBTLE CHANGE** | Без изменений |
| 15–19 | **MINOR PLOT TWIST** | Без изменений |
| 20–24 | **MAJOR PLOT TWIST** | −25% (умножается на 0.75) |
| 25+ | **GIANT PLOT TWIST** | Сброс в 0% |

При **NO CHANGE** в контекст инжектируется нейтральная инструкция без типа события.
При остальных уровнях — случайный нарративный шаблон из соответствующего пула.

---

## Что инжектируется в контекст

Формат инжекции:

```
[WILD EVENTS: MINOR PLOT TWIST | POSITIVE]
Type: a previously closed path becomes available.
Implement naturally in the scene. Do not skip or change the event type.
```

При принудительном событии добавляется строка:
```
(FORCED — tension reached maximum)
```

При NO CHANGE:
```
[WILD EVENTS: NO CHANGE]
No forced twist. Story continues naturally.
```

Метка `WILD EVENTS` настраивается через поле **Injection label**.
Позиция в контексте настраивается через **Injection depth** (0 = конец контекста).

---

## Интерфейс

Панель расширения в разделе Extensions отображает:

- **Tension** — текущий процент напряжения с прогресс-баром (градиент зелёный→оранжевый→красный)
- **Roll** — подробный расчёт: `baseRoll + modifier = finalScore` (или `⚡ FORCED` при принудительном событии)
- **Event** — название уровня события, зелёное при позитивном, красное при негативном
- **Event type** — конкретный нарративный шаблон (скрыт при NO CHANGE)
- **Impact** — `▲ POSITIVE` или `▼ NEGATIVE`

Последний результат сохраняется и восстанавливается при повторном открытии панели в той же сессии.

---

## Настройки

| Поле | По умолчанию | Описание |
|------|-------------|----------|
| **Enable** | включено | Мастер-переключатель |
| **Injection label** | `WILD EVENTS` | Метка в инжектируемом промпте |
| **Tension per message** | `0.5` | Прирост напряжения за каждое сообщение пользователя (от 0.1 до 10) |
| **Injection depth** | `0` | Позиция в контексте (0 = конец, увеличение = глубже) |
| **Reset Tension** | — | Сбросить напряжение в 0% вручную |

---

## Полный список событий по категориям

Каждый уровень (SUBTLE, MINOR, MAJOR, GIANT) имеет два пула по 20 шаблонов — позитивный и негативный. Тональность определяется чётностью броска d20.

---

<details>
<summary><strong>SUBTLE CHANGE — Тонкие изменения</strong></summary>

<details>
<summary>▲ Позитивные (20 вариантов)</summary>

1. an unexpected piece of information reaches the right person at the right time
2. a small gesture of goodwill from a stranger changes the mood of the scene
3. something lost is found in an unlikely place
4. a minor inconvenience resolves itself without intervention
5. an overheard fragment of conversation proves unexpectedly useful
6. someone arrives slightly earlier than expected
7. a small environmental detail creates an opportunity
8. an old favor is quietly repaid
9. the atmosphere shifts in a way that eases tension
10. a chance encounter with a familiar face
11. something that seemed broken turns out to still work
12. a small distraction provides cover for something else
13. an offhand remark accidentally contains useful truth
14. a minor delay leads to something being avoided
15. the weather or environment becomes briefly favorable
16. someone notices a detail others have missed
17. a forgotten resource turns out to be available
18. a small misunderstanding is cleared up before it grows
19. an unexpected moment of privacy presents itself
20. something trivial provides an unlikely insight

</details>

<details>
<summary>▼ Негативные (20 вариантов)</summary>

1. a minor object breaks or malfunctions at an inconvenient moment
2. an overheard fragment of conversation creates a wrong impression
3. someone arrives slightly earlier than expected and sees something they should not
4. a small environmental detail becomes an obstacle
5. a brief distraction causes something important to be missed
6. an offhand remark lands worse than intended
7. a minor delay has a ripple effect on something else
8. the weather or environment becomes briefly unpleasant
9. something assumed to be available turns out not to be
10. a small misunderstanding is not caught in time
11. a moment of inattention costs more than expected
12. something that seemed fine reveals a small flaw
13. an unwanted face appears at an inconvenient moment
14. a minor promise is unexpectedly called in
15. a small noise or movement draws unwanted attention
16. something private is accidentally made visible
17. a routine thing takes unexpectedly long
18. a trivial detail triggers an unexpected reaction in someone
19. a message arrives at the worst possible moment
20. a small assumption turns out to have been wrong all along

</details>
</details>

---

<details>
<summary><strong>MINOR PLOT TWIST — Малый сюжетный поворот</strong></summary>

<details>
<summary>▲ Позитивные (20 вариантов)</summary>

1. an unexpected ally appears with useful resources or knowledge
2. a piece of information surfaces that reframes an ongoing problem
3. someone in a position of influence shows unexpected favor
4. a previously closed path becomes available
5. an old connection resurfaces at a useful moment
6. a misunderstanding between two parties is accidentally resolved
7. an outside party intervenes in a way that benefits the current situation
8. a hidden resource or advantage is revealed
9. someone changes their stance without explanation
10. an obstacle removes itself through unrelated circumstances
11. a rival makes an error that creates an opening
12. a small victory has larger implications than expected
13. information shared in confidence proves more valuable than anticipated
14. an event elsewhere draws attention away from the current situation
15. a risk taken earlier pays off in an unexpected way
16. someone offers help without being asked
17. a dangerous situation defuses before it escalates
18. an unexpected delay creates space to reconsider something important
19. a third party's interference accidentally helps
20. something believed to be permanent turns out to be negotiable

</details>

<details>
<summary>▼ Негативные (20 вариантов)</summary>

1. a trusted source of information turns out to be unreliable
2. an outside party interferes in a way that complicates the current situation
3. a previously available path closes unexpectedly
4. someone in a position of influence withdraws their support
5. a hidden weakness or flaw is exposed at a bad moment
6. an old conflict resurfaces through no one's direct fault
7. a misunderstanding between two parties deepens rather than resolves
8. a carefully maintained arrangement falls apart over something minor
9. someone changes their stance without explanation and not in a good way
10. a risk taken earlier creates unforeseen complications now
11. an event elsewhere demands attention at the worst possible time
12. something believed to be settled turns out not to be
13. a third party's presence changes the dynamic in an unwelcome way
14. an obligation surfaces that cannot be easily ignored
15. a small deception unravels and takes something else down with it
16. a dangerous situation escalates before it can be addressed
17. an advantage is lost through circumstances outside anyone's control
18. something shared in confidence reaches the wrong ears
19. a past decision creates a complication in the present
20. an unexpected cost arrives alongside an expected benefit

</details>
</details>

---

<details>
<summary><strong>MAJOR PLOT TWIST — Крупный сюжетный поворот</strong> <em>(напряжение −25%)</em></summary>

<details>
<summary>▲ Позитивные (20 вариантов)</summary>

1. a significant threat is neutralized by an external force
2. a long-hidden truth surfaces and changes the situation dramatically
3. an unexpected alliance is offered under surprising terms
4. something previously out of reach becomes attainable
5. a powerful figure intervenes on behalf of someone without being asked
6. a crisis elsewhere redirects pressure away from the current situation
7. a secret kept by someone else turns out to be protective rather than dangerous
8. an enemy's plan fails due to factors entirely outside the protagonists' control
9. a major resource or opportunity arrives from an unexpected direction
10. two separate problems solve each other when brought together
11. a sacrifice made earlier is returned in a meaningful way
12. a long-standing obstacle is removed by someone else's actions
13. a catastrophic outcome is narrowly avoided through luck or timing
14. something thought permanently lost is recovered
15. a major shift in circumstances resets the balance of power
16. an unexpected revelation makes a seemingly impossible situation workable
17. someone with the ability to change everything chooses to do so
18. a dangerous confrontation ends without the expected consequences
19. a painful impasse is broken by an outside development
20. a hidden strength or capability reveals itself under pressure

</details>

<details>
<summary>▼ Негативные (20 вариантов)</summary>

1. a significant betrayal is revealed — not recent, but long-running
2. a major external force enters the situation with its own agenda
3. something that seemed secure collapses without warning
4. a truth surfaces that changes the meaning of past events
5. a crisis arrives from a direction no one was watching
6. a powerful figure withdraws protection or support at a critical moment
7. an alliance fractures under pressure that was not anticipated
8. a plan that seemed to be working is revealed to have been compromised
9. a previous action creates consequences that can no longer be delayed
10. a hidden threat that has been building finally makes itself visible
11. someone trusted makes a decision that cannot be undone
12. a resource or advantage disappears at the worst possible moment
13. two separate problems converge into something worse than either alone
14. a secret is exposed in front of the worst possible audience
15. a dangerous force is accidentally awakened or provoked
16. the cost of a past choice arrives all at once
17. an irreversible mistake is made before anyone realizes what is happening
18. a situation spirals past the point where the usual solutions apply
19. someone disappears or becomes unavailable at a critical moment
20. a major assumption everyone shared turns out to have been completely wrong

</details>
</details>

---

<details>
<summary><strong>GIANT PLOT TWIST — Грандиозный сюжетный поворот</strong> <em>(напряжение сброс в 0%)</em></summary>

<details>
<summary>▲ Позитивные (20 вариантов)</summary>

1. a catastrophe is averted by the narrowest possible margin and the world shifts because of it
2. an enemy becomes an ally through circumstances that would have seemed impossible
3. something believed to be permanent and immovable is suddenly gone
4. a force larger than the current conflict intervenes and resets the stakes
5. a sacrifice made long ago pays off in a way no one expected or could have planned
6. the truth behind a long-running mystery is finally revealed and it changes everything
7. a major power structure collapses in a way that opens entirely new possibilities
8. someone thought lost returns, changed, at exactly the right moment
9. a decision that seemed small at the time is revealed to have shaped everything since
10. an impossible alliance holds when it was expected to shatter
11. a source of ongoing threat or suffering is permanently removed
12. something dormant and forgotten wakes up in a way that benefits the current situation
13. a long-running deception is exposed and the aftermath is better than the lie
14. an enemy destroys themselves without any outside intervention
15. a single revelation recontextualizes the entire arc of events up to now
16. a crisis of historic proportions resolves in an unexpected direction
17. what everyone believed to be an ending turns out to be a beginning
18. a power or resource of enormous significance changes hands without violence
19. an external catastrophe unites previously opposed forces
20. something that was supposed to be impossible simply happens

</details>

<details>
<summary>▼ Негативные (20 вариантов)</summary>

1. a catastrophe arrives that changes the shape of the world going forward
2. an ally becomes an enemy through a revelation neither side can take back
3. something believed to be safe and permanent is destroyed or lost
4. a force larger than the current conflict arrives with its own agenda and dwarfs everything else
5. a long-running deception is exposed and the fallout is worse than anyone feared
6. a source of stability that everyone relied on disappears
7. a secret kept by someone trusted turns out to have been the foundation of something dangerous
8. a past event reasserts itself and cannot be managed or delayed any further
9. an irreversible decision is made by someone with the power to make it
10. a power structure collapses and the chaos it releases is worse than the structure itself
11. something dormant and forgotten wakes up in a way that threatens everything
12. a single action sets off a chain of consequences that cannot be stopped
13. a sacrifice is demanded that has no acceptable alternative
14. an outside force permanently closes off options that seemed available
15. what everyone believed to be a beginning turns out to have been an ending
16. a truth is revealed that cannot be unknown and changes every relationship in its wake
17. an enemy proves to be far more significant than anyone understood
18. a crisis of historic proportions resolves in the worst possible direction
19. the cost of everything done up to this point arrives simultaneously
20. something that was supposed to be impossible simply happens and it is terrible

</details>
</details>
