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
import { readBests, resolveSeed, TUNE, formatClock, type StorageLike } from 'components/ephemeris/survey';
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
  best: true,
  clock: true,
  fuelFill: true,
  fuelLabel: true,
  scan: true,
  scanArc: true,
  scanLabel: true,
  marker: true,
  markerGlyph: true,
  markerLabel: true,
};

/** Storage that is blocked or missing (private mode, site data off) means no bests kept. */
function safeStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** `20261126` reads as `2026-11-26`. */
const dayText = (label: string) => `${label.slice(0, 4)}-${label.slice(4, 6)}-${label.slice(6, 8)}`;

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
  // counts flights started, so each one replays the fade from black
  const [run, setRun] = useState(0);
  // The BURN zone and the touch wording show once a finger is involved.
  const [touch, setTouch] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  );

  const seed = useMemo(() => resolveSeed(window.location.search, new Date()), []);
  const storage = useMemo(safeStorage, []);
  // read again whenever the title or the result comes up
  const bests = useMemo(() => readBests(storage, seed.label), [storage, seed, phase]);

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
  const bestWord = seed.daily ? "TODAY'S BEST" : 'SYSTEM BEST';
  const bestsLine =
    bests.allTime > 0 ? `${bestWord} ${bests.seed} · ALL-TIME ${bests.allTime}` : '';
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

  return (
    <Box className="eph-page" display="flex" flexDirection="column" bg="black">
      <style>{hudCss}</style>
      <Header />
      {/* touch-action: a drag steers the ship; the browser must not claim it */}
      <Box position="relative" flex="1" overflow="hidden" cursor="crosshair" touchAction="none">
        <Box ref={containerRef} position="absolute" inset={0} />
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
            {/* the score in a survey, the discovery tally in free drift */}
            <Text
              {...readout}
              fontSize={surveying ? '15px' : '12px'}
              opacity={surveying ? 1 : 0.5}
              ref={bind('contacts')}
            />
            <Box display={surveying ? 'block' : 'none'}>
              <Text {...readout} ref={bind('best')} />
              <Text
                {...hudFont}
                className="eph-warn"
                mt="10px"
                fontSize="22px"
                letterSpacing=".14em"
                lineHeight="28px"
                ref={bind('clock')}
              />
              <Box
                mt="8px"
                ml="auto"
                w="min(140px, 100%)"
                h="8px"
                border="1px solid rgba(255,255,255,.55)"
              >
                <Box h="100%" w="100%" bg="white" ref={bind('fuelFill')} />
              </Box>
              <Text {...readout} className="eph-warn" fontSize="11px" ref={bind('fuelLabel')} />
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

          {/* scan ring: fills while an unscanned body is in range at scan speed */}
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
            <svg width="132" height="132" viewBox="0 0 132 132" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="66" cy="66" r="62" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1" />
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
            <Text
              {...hudFont}
              mt="12px"
              px="20px"
              textAlign="center"
              fontSize="12px"
              letterSpacing=".22em"
              textShadow="0 0 8px #000"
              ref={bind('scanLabel')}
            />
          </Flex>

          {/* target marker: on the nearest unscanned contact, or an arrow toward it */}
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

        {/* title: the world drifts behind it; any press on the game starts a survey */}
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
                FLY CLOSE AND SLOW TO SCAN
                <br />
                BURNING COSTS FUEL, SCANS REFUEL
                <br />
                SURVEY WINDOW {formatClock(TUNE.WINDOW_SECONDS)}
              </Text>
            </Flex>
            <Flex {...overlayGroup}>
              {bestsLine && <Text {...overlayLine}>{bestsLine}</Text>}
              <Text {...overlayLine}>
                {touch ? 'DRAG TO STEER · HOLD BURN' : 'MOUSE OR WASD STEERS · HOLD / SPACE = BURN'}
              </Text>
              <Text {...hudFont} className="eph-blink" fontSize="13px" letterSpacing=".3em">
                CLICK, TAP OR PRESS A KEY
              </Text>
              {freeDrift}
            </Flex>
          </Flex>
        )}

        {/* the window has closed: any press after the lock flies the same system again */}
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
                SURVEY CLOSED
              </Text>
              <Text {...hudFont} fontSize="20px" letterSpacing=".3em" mr="-.3em">
                SCORE {result.score}
              </Text>
              {result.bests.newSeedBest && (
                <Text {...hudFont} fontSize="13px" letterSpacing=".3em" mr="-.3em">
                  NEW BEST
                </Text>
              )}
              <Text {...overlayLine}>
                {result.contacts === 0
                  ? 'NO CONTACTS SCANNED'
                  : `${result.contacts} CONTACT${result.contacts === 1 ? '' : 'S'} SCANNED`}
                {result.rarest && (
                  <>
                    <br />
                    RAREST · {result.rarest.name}
                    {result.rarest.name.includes(result.rarest.kind) ? '' : ` · ${result.rarest.kind}`}
                  </>
                )}
              </Text>
            </Flex>
            <Flex {...overlayGroup}>
              <Text {...overlayLine}>
                {systemLine}
                <br />
                {bestWord} {result.bests.seed} · ALL-TIME {result.bests.allTime}
              </Text>
              <Text {...hudFont} className="eph-blink" fontSize="13px" letterSpacing=".3em">
                TAP OR PRESS A KEY TO RETRY
              </Text>
              {freeDrift}
            </Flex>
          </Flex>
        )}
      </Box>
    </Box>
  );
};

export default Ephemeris;
