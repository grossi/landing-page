import { useEffect, useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import Header from 'components/layout/Header';
import { createEphemeris } from 'components/ephemeris/createEphemeris';

const hudFont = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  color: 'white',
} as const;

// Fullscreen three.js simulation; the sim writes HUD text straight into the
// ref'd elements every frame, so React never re-renders while it runs.
const Ephemeris = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !bodyRef.current || !distRef.current || !speedRef.current) return;
    return createEphemeris(containerRef.current, {
      body: bodyRef.current,
      dist: distRef.current,
      speed: speedRef.current,
    });
  }, []);

  return (
    <Box height="100vh" display="flex" flexDirection="column" bg="black">
      <Header />
      <Box position="relative" flex="1" overflow="hidden" cursor="crosshair">
        <Box ref={containerRef} position="absolute" inset={0} />

        {/* HUD */}
        <Box position="absolute" inset={0} pointerEvents="none" userSelect="none">
          <Text
            {...hudFont}
            position="absolute"
            top="18px"
            left="20px"
            fontSize="15px"
            letterSpacing=".18em"
            ref={bodyRef}
          />
          <Text
            {...hudFont}
            position="absolute"
            top="42px"
            left="20px"
            fontSize="12px"
            letterSpacing=".18em"
            opacity={0.5}
            ref={distRef}
          />
          <Text
            {...hudFont}
            position="absolute"
            top="18px"
            right="20px"
            fontSize="12px"
            letterSpacing=".18em"
            opacity={0.5}
            ref={speedRef}
          />
          <Text
            {...hudFont}
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
          <Text
            {...hudFont}
            position="absolute"
            bottom="26px"
            left={0}
            right={0}
            textAlign="center"
            fontSize="12px"
            letterSpacing=".28em"
            opacity={0.45}
          >
            MOUSE STEERS &middot; HOLD / W = BURN &middot; NOTHING HERE CAN HURT YOU
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default Ephemeris;
