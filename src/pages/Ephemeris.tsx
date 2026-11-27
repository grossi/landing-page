import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import Header from 'components/layout/Header';
import {
  createEphemeris,
  type EphemerisGame,
  type EphemerisHudElements,
  type EphemerisPhase,
  type SurveyResult,
} from 'components/ephemeris/createEphemeris';
import {
  FIND_IDS,
  findNote,
  FINDS,
  forgetLog,
  readCharted,
  withMemory,
  readLog,
  resolveSeed,
  type DayLog,
  type FindId,
  type Places,
  type Schedule,
  type StorageLike,
} from 'components/ephemeris/survey';
import { monoFont } from 'config/site';

const hudFont = {
  fontFamily: monoFont,
  color: 'white',
} as const;

/** One line of the corner readouts: 12 px, dimmed, on the HUD's 24 px pitch. */
const readout = {
  ...hudFont,
  fontSize: '12px',
  letterSpacing: '.18em',
  lineHeight: '24px',
  opacity: 0.5,
} as const;

// Title and end screens keep the middle of the view clear: the ship and the
// system it is flying at are the picture, the words sit above and below it.
const overlay = {
  position: 'absolute',
  inset: 0,
  direction: 'column',
  align: 'center',
  justify: 'space-between',
  px: '16px',
  pt: { base: '36px', md: '64px' },
  pb: { base: '40px', md: '64px' },
  textAlign: 'center',
  pointerEvents: 'none',
  userSelect: 'none',
  textShadow: '0 0 10px #000, 0 0 3px #000',
} as const;

const overlayGroup = { direction: 'column', align: 'center', gap: '12px' } as const;

const overlayLine = {
  ...hudFont,
  fontSize: 'clamp(11px, 3.1vw, 13px)',
  letterSpacing: '.22em',
  lineHeight: 2,
  opacity: 0.7,
} as const;

// Blinks and the fade that covers the jump back to the start line. Plain
// CSS: the sim switches `data-warn`, and nothing here re-renders per frame.
const hudCss = `
@keyframes eph-blink { 50% { opacity: 0; } }
@keyframes eph-fade { from { opacity: 1; } to { opacity: 0; } }
/* dvh: on a phone the browser's toolbar must not cover the BURN zone */
.eph-page { height: 100vh; height: 100dvh; }
.eph-blink { animation: eph-blink 1.2s steps(2) infinite; }
.eph-warn[data-warn="on"] { animation: eph-blink .5s steps(2) infinite; }
.eph-fade { animation: eph-fade .5s ease-out forwards; }
/* the dark: closes in from the edges from 3:00, black at 4:00 (the sim sets
   --dark). Space is black already, so its edge is drawn: a faint line that
   shrinks toward the ship, and black beyond it. */
.eph-dark {
  --dark: 0;
  --edge: calc((1 - var(--dark)) * 72%);
  background:
    radial-gradient(circle at 50% 50%,
      transparent var(--edge),
      rgba(255, 255, 255, .28) calc(var(--edge) + .15%),
      rgba(255, 255, 255, .28) calc(var(--edge) + .3%),
      rgba(0, 0, 0, .9) calc(var(--edge) + .6%),
      #000 calc(var(--edge) + 12%)),
    rgba(0, 0, 0, calc(max(0, var(--dark) - 0.8) * 5));
  opacity: calc(var(--dark) * 6);
}
@media (prefers-reduced-motion: reduce) {
  .eph-blink, .eph-warn[data-warn="on"] { animation: none; }
}
`;

type HudKey = keyof EphemerisHudElements;
/** Every element the sim writes to; the type makes a forgotten one a compile error. */
const HUD_KEYS: Record<HudKey, true> = {
  body: true,
  dist: true,
  speed: true,
  sector: true,
  contacts: true,
  ping: true,
  loop: true,
  clock: true,
  scan: true,
  scanArc: true,
  scanTick: true,
  scanLabel: true,
  marker: true,
  markerGlyph: true,
  markerLabel: true,
  dark: true,
};

/** Storage that is blocked or missing (private mode, site data off) means no log kept. */
function safeStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** `20261126` reads as `2026-11-26`. */
const dayText = (label: string) => `${label.slice(0, 4)}-${label.slice(4, 6)}-${label.slice(6, 8)}`;

/** What the sim knows of the day that the notes need. */
interface Day {
  places: Places;
  schedule: Schedule;
}

/**
 * The day's log, as the title and end screens show it: the finds logged by
 * name, then one line for each find a logged one's note points at.
 */
function LogLines({ logged, day }: { logged: readonly FindId[]; day: Day | null }) {
  const clues = FIND_IDS.filter((id) => {
    const teller = FINDS[id].toldBy;
    return !logged.includes(id) && teller !== null && logged.includes(teller);
  });
  if (logged.length === 0) return null;
  return (
    <Text {...overlayLine}>
      {logged.map((id) => FINDS[id].label).join(' · ')}
      {day &&
        clues.map((id) => (
          <span key={id}>
            <br />
            {findNote(FINDS[id].toldBy!, day.places, day.schedule)}
          </span>
        ))}
    </Text>
  );
}

// Fullscreen three.js simulation; the sim writes HUD text straight into the
// ref'd elements every frame, so React re-renders only when the phase
// changes (title, survey, closed, free drift).
const Ephemeris = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const burnZoneRef = useRef<HTMLDivElement>(null);
  const hudRefs = useRef<Partial<Record<HudKey, HTMLElement | SVGElement | null>>>({});
  const gameRef = useRef<EphemerisGame | null>(null);
  const [phase, setPhase] = useState<EphemerisPhase>('title');
  const [result, setResult] = useState<SurveyResult | null>(null);
  const [day, setDay] = useState<Day | null>(null);
  // bumped when the day's log is forgotten, so the screens read it again
  const [forgotten, setForgotten] = useState(0);
  // counts flights started, so each one replays the fade from black
  const [run, setRun] = useState(0);
  // The BURN zone and the touch wording show once a finger is involved.
  const [touch, setTouch] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  );

  const seed = useMemo(() => resolveSeed(window.location.search, new Date()), []);
  // one store for the page and the sim, so the log they read is the same
  // even where the browser keeps nothing (see withMemory)
  const storage = useMemo(() => withMemory(safeStorage()), []);
  // read again whenever the title or the result comes up
  const log: DayLog = useMemo(() => readLog(storage, seed.label), [storage, seed, phase, forgotten]);
  const daysCharted = useMemo(() => readCharted(storage), [storage, phase]);
  const charted = log.logged.length === FIND_IDS.length;

  const bind = (key: HudKey) => (node: HTMLElement | SVGElement | null) => {
    hudRefs.current[key] = node;
  };

  useEffect(() => {
    const container = containerRef.current;
    const hud = hudRefs.current;
    if (!container || (Object.keys(HUD_KEYS) as HudKey[]).some((key) => !hud[key])) return;
    const game = createEphemeris(container, hud as EphemerisHudElements, {
      seed,
      storage,
      burnZone: burnZoneRef.current,
      onPhase: (next, closed) => {
        setPhase(next);
        if (closed) setResult(closed);
        if (next === 'survey' || next === 'drift') setRun((n) => n + 1);
      },
    });
    gameRef.current = game;
    setDay({ places: game.places, schedule: game.schedule });
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [seed, storage]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setTouch(true);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const flying = phase === 'survey' || phase === 'drift';
  const surveying = phase === 'survey';
  const systemLine = seed.daily ? `SYSTEM OF ${dayText(seed.label)} UTC` : `SYSTEM ${seed.label.toUpperCase()}`;
  const loops = (n: number) => `${n} LOOP${n === 1 ? '' : 'S'}`;
  const freeDrift = (
    <Box
      as="button"
      {...hudFont}
      mt="6px"
      px="18px"
      py="10px"
      fontSize="12px"
      letterSpacing=".28em"
      border="1px solid rgba(255,255,255,.45)"
      bg="rgba(0,0,0,.55)"
      cursor="pointer"
      pointerEvents="auto"
      _hover={{ borderColor: 'white' }}
      onClick={() => gameRef.current?.start('drift')}
    >
      FREE DRIFT · NO CLOCK
    </Box>
  );
  // Today's log, forgotten: the system flown again from nothing. The best
  // and the days charted stay. Shown once there is something to forget.
  const forget = (log.loops > 0 || log.logged.length > 0) && (
    <Box
      as="button"
      {...hudFont}
      px="14px"
      py="8px"
      fontSize="11px"
      letterSpacing=".24em"
      border="1px solid rgba(255,255,255,.25)"
      bg="rgba(0,0,0,.55)"
      opacity={0.7}
      cursor="pointer"
      pointerEvents="auto"
      _hover={{ opacity: 1, borderColor: 'rgba(255,255,255,.6)' }}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        e.currentTarget.blur();
        forgetLog(storage, seed.label);
        setForgotten((n) => n + 1);
        gameRef.current?.menu();
      }}
    >
      FORGET TODAY
    </Box>
  );
  const buttons = (
    <Flex direction="column" align="center" gap="10px">
      {freeDrift}
      {forget}
    </Flex>
  );

  return (
    <Box className="eph-page" display="flex" flexDirection="column" bg="black">
      <style>{hudCss}</style>
      <Header />
      {/* touch-action: a drag steers the ship; the browser must not claim it */}
      <Box position="relative" flex="1" overflow="hidden" cursor="crosshair" touchAction="none">
        <Box ref={containerRef} position="absolute" inset={0} />
        {/* the dark sits over the world and under the HUD */}
        <Box className="eph-dark" position="absolute" inset={0} pointerEvents="none" ref={bind('dark')} />
        {flying && (
          <Box key={run} className="eph-fade" position="absolute" inset={0} bg="black" pointerEvents="none" />
        )}

        {/* HUD: always mounted (the sim holds its elements), shown in flight */}
        <Box
          position="absolute"
          inset={0}
          pointerEvents="none"
          userSelect="none"
          visibility={flying ? 'visible' : 'hidden'}
        >
          <Box position="absolute" top="18px" left="20px" maxW={{ base: '54%', md: '40%' }}>
            <Text {...hudFont} fontSize="15px" letterSpacing=".18em" lineHeight="24px" ref={bind('body')} />
            <Text {...readout} ref={bind('dist')} />
            <Box
              as="button"
              {...hudFont}
              mt="8px"
              px="10px"
              py="5px"
              fontSize="11px"
              letterSpacing=".24em"
              border="1px solid rgba(255,255,255,.3)"
              opacity={0.6}
              cursor="pointer"
              pointerEvents={flying ? 'auto' : 'none'}
              _hover={{ opacity: 1 }}
              onClick={(e) => {
                // or the hidden button keeps the focus and takes every key
                // that should start the next run
                e.currentTarget.blur();
                gameRef.current?.menu();
              }}
            >
              {touch ? 'MENU' : 'ESC · MENU'}
            </Box>
          </Box>

          <Box position="absolute" top="18px" right="20px" maxW={{ base: '42%', md: '40%' }} textAlign="right">
            <Text {...readout} ref={bind('speed')} />
            <Text {...readout} ref={bind('sector')} />
            {/* the log in a loop, the discovery tally in free drift */}
            <Text
              {...readout}
              fontSize={surveying ? '15px' : '12px'}
              opacity={surveying ? 1 : 0.5}
              ref={bind('contacts')}
            />
            <Box display={surveying ? 'block' : 'none'}>
              <Text {...readout} ref={bind('loop')} />
              <Text
                {...hudFont}
                className="eph-warn"
                mt="10px"
                fontSize="22px"
                letterSpacing=".14em"
                lineHeight="28px"
                ref={bind('clock')}
              />
            </Box>
          </Box>

          <Text
            {...hudFont}
            position="absolute"
            top={{ base: '250px', md: '64px' }}
            left={0}
            right={0}
            px="20px"
            textAlign="center"
            fontSize="12px"
            letterSpacing={{ base: '.2em', md: '.3em' }}
            opacity={0}
            ref={bind('ping')}
          />
          <Text
            {...hudFont}
            display={{ base: 'none', md: 'block' }}
            position="absolute"
            top="26px"
            left={0}
            right={0}
            textAlign="center"
            fontSize="13px"
            letterSpacing=".5em"
            opacity={0.8}
          >
            EPHEMERIS
          </Text>

          {/* the reticle: the signal's tick on its rim, the scan's arc round it */}
          <Flex
            position="absolute"
            inset={0}
            direction="column"
            align="center"
            justify="center"
            opacity={0}
            display={surveying ? 'flex' : 'none'}
            ref={bind('scan')}
          >
            <Box position="relative" w="132px" h="132px">
              <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="66" cy="66" r="62" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1" />
                <circle
                  cx="66"
                  cy="66"
                  r="62"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="3"
                  pathLength={100}
                  strokeDasharray="100"
                  strokeDashoffset="100"
                  ref={bind('scanArc')}
                />
              </svg>
              {/* rotated round the centre toward the signal; its child sits on the rim */}
              <Box position="absolute" top="50%" left="50%" w={0} h={0} opacity={0} ref={bind('scanTick')}>
                <Box position="absolute" left="56px" top="-1px" w="14px" h="2px" bg="white" />
              </Box>
            </Box>
            {/* above the reticle: below it sits the ship */}
            <Text
              {...hudFont}
              position="absolute"
              bottom="calc(50% + 78px)"
              left={0}
              right={0}
              px="20px"
              textAlign="center"
              fontSize="12px"
              letterSpacing=".2em"
              textShadow="0 0 8px #000"
              ref={bind('scanLabel')}
            />
          </Flex>

          {/* bracket on a find the ship is locked on */}
          <Box
            position="absolute"
            top={0}
            left={0}
            w={0}
            h={0}
            opacity={0}
            display={surveying ? 'block' : 'none'}
            ref={bind('marker')}
          >
            <Flex
              position="absolute"
              direction="column"
              align="center"
              w="160px"
              ml="-80px"
              mt="-12px"
              textShadow="0 0 6px #000"
            >
              <Text {...hudFont} fontSize="16px" lineHeight="24px" ref={bind('markerGlyph')} />
              <Text
                {...hudFont}
                fontSize="11px"
                letterSpacing=".2em"
                mr="-.2em"
                lineHeight="16px"
                whiteSpace="pre-line"
                textAlign="center"
                opacity={0.8}
                ref={bind('markerLabel')}
              />
            </Flex>
          </Box>

          <Text
            {...hudFont}
            position="absolute"
            bottom="26px"
            left={0}
            right={0}
            px="20px"
            textAlign="center"
            fontSize="12px"
            letterSpacing={{ base: '.2em', md: '.28em' }}
            opacity={0.45}
          >
            {touch ? 'DRAG STEERS · HOLD BURN' : 'MOUSE OR WASD STEERS · HOLD / SPACE = BURN'}
          </Text>

          {/* BURN zone for the second thumb; the sim reads its box, it takes no events itself */}
          <Flex
            ref={burnZoneRef}
            display={flying && touch ? 'flex' : 'none'}
            position="absolute"
            right="20px"
            bottom="64px"
            w="96px"
            h="96px"
            align="center"
            justify="center"
            border="1px solid rgba(255,255,255,.55)"
            bg="rgba(0,0,0,.35)"
          >
            <Text {...hudFont} fontSize="12px" letterSpacing=".28em" mr="-.28em">
              BURN
            </Text>
          </Flex>
        </Box>

        {/* title: the world drifts behind it; any press on the game starts a loop */}
        {phase === 'title' && (
          <Flex {...overlay}>
            <Flex {...overlayGroup}>
              <Text
                as="h1"
                {...hudFont}
                fontSize="clamp(28px, 8vw, 54px)"
                fontWeight="bold"
                letterSpacing=".32em"
                mr="-.32em"
              >
                EPHEMERIS
              </Text>
              <Text {...overlayLine}>{systemLine}</Text>
              <Text {...overlayLine} opacity={0.9}>
                POINT THE NOSE AT THE SIGNAL
                <br />
                LOG FIVE FINDS BEFORE THE DARK
                <br />
                WHAT YOU LOG STAYS FOR TODAY
              </Text>
            </Flex>
            <Flex {...overlayGroup}>
              {charted ? (
                <Text {...overlayLine} opacity={0.9}>
                  CHARTED · BEST {loops(log.best)}
                </Text>
              ) : (
                log.loops > 0 && (
                  <Text {...overlayLine} opacity={0.9}>
                    LOG {log.logged.length}/{FIND_IDS.length} AFTER {loops(log.loops)}
                  </Text>
                )
              )}
              {!charted && <LogLines logged={log.logged} day={day} />}
              <Text {...overlayLine}>
                {touch ? 'DRAG TO STEER · HOLD BURN' : 'MOUSE OR WASD STEERS · HOLD / SPACE = BURN'}
              </Text>
              <Text {...hudFont} className="eph-blink" fontSize="13px" letterSpacing=".3em">
                {charted ? 'PRESS TO CHART IT AGAIN' : 'CLICK, TAP OR PRESS A KEY'}
              </Text>
              {buttons}
            </Flex>
          </Flex>
        )}

        {/* the loop is over: any press after the lock starts the next one */}
        {phase === 'closed' && result && (
          <Flex {...overlay}>
            <Flex {...overlayGroup}>
              <Text
                as="h1"
                {...hudFont}
                fontSize="clamp(22px, 6.4vw, 44px)"
                fontWeight="bold"
                letterSpacing=".28em"
                mr="-.28em"
              >
                {result.charted ? 'SYSTEM CHARTED' : 'THE DARK CAME IN'}
              </Text>
              <Text {...hudFont} fontSize="20px" letterSpacing=".3em" mr="-.3em">
                LOG {result.logged.length}/{FIND_IDS.length}
              </Text>
              {result.charted ? (
                <Text {...hudFont} fontSize="13px" letterSpacing=".3em" mr="-.3em">
                  IN {loops(result.charted.loops)}
                  {result.charted.newBest ? ' · NEW BEST' : ` · BEST ${loops(result.charted.best)}`}
                </Text>
              ) : (
                <Text {...overlayLine}>
                  {result.loggedNow.length === 0
                    ? `LOOP ${result.loop} · NOTHING NEW`
                    : `LOOP ${result.loop} · ${result.loggedNow.map((id) => FINDS[id].label).join(' · ')}`}
                </Text>
              )}
            </Flex>
            <Flex {...overlayGroup}>
              {!result.charted && <LogLines logged={result.logged} day={day} />}
              <Text {...overlayLine}>
                {systemLine}
                {daysCharted > 0 && (
                  <>
                    <br />
                    DAYS CHARTED {daysCharted}
                  </>
                )}
              </Text>
              <Text {...hudFont} className="eph-blink" fontSize="13px" letterSpacing=".3em">
                {result.charted ? 'TAP OR PRESS A KEY TO CHART IT AGAIN' : 'TAP OR PRESS A KEY FOR THE NEXT LOOP'}
              </Text>
              {buttons}
            </Flex>
          </Flex>
        )}
      </Box>
    </Box>
  );
};

export default Ephemeris;
