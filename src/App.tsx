import { useCallback, useEffect, useState } from 'react'
import { ConfigProvider } from 'antd'
import { buildAntTheme } from './design/antTheme'
import { useTheme } from './hooks/useTheme'
import { useTypefaces } from './hooks/useTypefaces'
import { BottomBar, type TabKey } from './components/chrome/BottomBar'
import { TopBar } from './components/chrome/TopBar'
import { TypefacePicker } from './components/chrome/TypefacePicker'
import { Library } from './screens/Library'
import { LookUp } from './screens/LookUp'
import { Practice } from './screens/Practice'
import { Progress } from './screens/Progress'
import { WordDetail } from './screens/WordDetail'
import { clearShareUrl, readSharedCapture } from './domain/shareTarget'
import { listDueWords } from './storage/db'
import styles from './App.module.css'

/**
 * The app shell.
 *
 * A fixed viewport with one scrolling region and a nav pinned beneath it —
 * `100dvh` rather than `100vh` so the layout tracks the mobile URL bar
 * collapsing instead of hiding the last 60px of content behind it.
 *
 * Tabs are local state rather than a router. Five destinations, no deep links
 * yet, and no URL worth sharing — a router would be four dependencies and a
 * base-path problem in exchange for nothing. The one route that will need real
 * URL handling is `/share`, the share-target handler, and that is a single
 * entry point rather than a reason to route the whole app.
 *
 * Library, Look Up, Practice, and Progress are real. More holds the appearance
 * settings and will gain backup. `docs/BUILD_PLAN.md` has what is still to come.
 */

/**
 * A word shared into the app from the OS share sheet, read once at module load.
 *
 * Read here rather than in an effect so the first render already knows: the
 * shell can open Look Up directly instead of painting the library and then
 * jumping, and the URL is cleared before anything can reload it.
 */
const SHARED = readSharedCapture()
if (SHARED) clearShareUrl()

export default function App() {
  const { preference, resolved, cycle } = useTheme()
  const faces = useTypefaces()
  const [tab, setTab] = useState<TabKey>(SHARED ? 'lookup' : 'library')
  const [dueCount, setDueCount] = useState(0)

  /*
   * The due badge on the nav. The library keeps its own count, since it is
   * already reading every word to list them.
   *
   * Re-read after a save rather than incremented locally: a save can also be a
   * word that was already in the library, and a counter that assumes every save
   * is a new word drifts from the truth with no way to notice.
   */
  const refreshCounts = useCallback(async () => {
    const due = await listDueWords()
    setDueCount(due.length)
  }, [])

  useEffect(() => {
    void refreshCounts()
  }, [refreshCounts])

  /*
   * Bumped after a save so the library re-reads.
   *
   * A counter rather than passing the words down from here: the library owns
   * its own query, including the search filter, and lifting that into the shell
   * would make every screen depend on a list only one of them uses.
   */
  const [libraryToken, setLibraryToken] = useState(0)

  /*
   * Bumped whenever something Progress reports on changes.
   *
   * Progress is the one screen whose numbers all move while it is closed: a
   * session finished on the Practice tab changes the streak, the ladder, and
   * the week at once. Without this it would show whatever was true when the tab
   * was first opened, which on a tab you return to is almost never now.
   */
  const [progressToken, setProgressToken] = useState(0)

  const handleProgressed = useCallback(() => {
    void refreshCounts()
    setProgressToken((token) => token + 1)
  }, [refreshCounts])

  const handleSaved = useCallback(() => {
    void refreshCounts()
    setLibraryToken((token) => token + 1)
    // A saved word joins the ladder at `spotted`, so Progress is stale too.
    setProgressToken((token) => token + 1)
  }, [refreshCounts])

  /*
   * The trail of open words, if any. Detail is a layer over the library rather
   * than a sixth tab: the nav still shows Library as where you are, because
   * that is where Back eventually returns you.
   *
   * A stack rather than a single id: a related-word popup on the detail screen
   * can open a second word's detail on top of the first, which a synonym's
   * synonym can do again. Back pops one level at a time, so the trail a reader
   * follows through a chain of synonyms is the trail they can retrace — the
   * whole point of the popup being "read it without losing your place" is
   * defeated if going one level deeper then costs the place you actually
   * started from.
   */
  const [wordStack, setWordStack] = useState<string[]>([])
  const openWordId = wordStack[wordStack.length - 1]
  /** What Back returns to — the word beneath this one, or Library at the floor. */
  const backToWordId = wordStack[wordStack.length - 2]

  const openWord = useCallback((id: string) => {
    setWordStack((stack) => [...stack, id])
  }, [])

  const closeWord = useCallback(() => {
    setWordStack((stack) => stack.slice(0, -1))
  }, [])

  const handleDeleted = useCallback(() => {
    setWordStack([])
    setLibraryToken((token) => token + 1)
    // A deleted word leaves the ladder, so its distribution changed.
    setProgressToken((token) => token + 1)
    void refreshCounts()
  }, [refreshCounts])

  /*
   * Leaving the Library tab closes whatever word was open.
   *
   * Without this, tapping Practice and coming back would land on a word detail
   * rather than the list — the nav would say Library while showing one word,
   * and Back would be the only way out of a screen you did not choose.
   */
  const selectTab = useCallback((next: TabKey) => {
    setWordStack([])
    setTab(next)
  }, [])

  return (
    <ConfigProvider theme={buildAntTheme(resolved)}>
      <div className={styles.shell}>
        <TopBar preference={preference} resolved={resolved} onCycleTheme={cycle} />
        <main className={styles.main}>
          {tab === 'library' &&
            (openWordId ? (
              <WordDetail
                /* Keyed on the word so opening a different one remounts rather
                   than showing the previous word's content while it loads. */
                key={openWordId}
                wordId={openWordId}
                backToWordId={backToWordId}
                onBack={closeWord}
                onDeleted={handleDeleted}
                onOpenWord={openWord}
                onSaved={handleSaved}
              />
            ) : (
              <Library refreshToken={libraryToken} onOpenWord={openWord} />
            ))}
          {tab === 'lookup' && (
            <LookUp
              onSaved={handleSaved}
              initialWord={SHARED?.word}
              initialContext={SHARED?.context}
            />
          )}
          {tab === 'practice' && <Practice onProgress={handleProgressed} />}
          {tab === 'progress' && <Progress refreshToken={progressToken} />}
          {tab === 'more' && <More faces={faces} />}
        </main>
        <BottomBar active={tab} onSelect={selectTab} dueCount={dueCount} />
      </div>
    </ConfigProvider>
  )
}

/* -------------------------------------------------------------------------- */

interface MoreProps {
  faces: ReturnType<typeof useTypefaces>
}

/**
 * More — appearance now, backup and about later.
 *
 * Still the only screen defined inside the shell rather than in `screens/`. It
 * is two pickers and a sentence, and moving it out would be a file whose whole
 * content is the markup below. It moves the day it gains a third thing.
 */
function More({ faces }: MoreProps) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>More</h1>
      <p className={styles.body}>
        Appearance now; backup and about once there is something to back up.
      </p>

      {/*
        Theme is not here — it lives in the header, where it is one tap from
        anywhere. The reading face stays: it is a considered choice that wants
        room to preview each option, not a control to flip in passing.
      */}
      <section className={styles.section}>
        <TypefacePicker
          name="word-face"
          label="Word face"
          hint="How saved words are set, wherever they appear."
          /* A word worth previewing in: long enough to show the letterforms,
             and one someone might genuinely have saved. */
          sample="perspicacious"
          large
          value={faces.preference.word}
          onChange={faces.setWordFace}
        />
      </section>

      <section className={styles.section}>
        <TypefacePicker
          name="body-face"
          label="Reading face"
          hint="Definitions, notes, and everything that is not the word."
          sample="Having a ready insight into and understanding of things."
          value={faces.preference.body}
          onChange={faces.setBodyFace}
        />
      </section>
    </div>
  )
}
