import { useEffect, useRef, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { createDeepField } from 'components/deepfield/createDeepField';
import type { DeepFieldHandle, DeepFieldMode } from 'components/deepfield/createDeepField';
import { grey, label, mono } from 'components/home/styles';

interface FieldPanelProps {
  /**
   * Where the expanded panel starts, in viewport pixels: the height of the
   * sticky header, which stays on screen during play.
   */
  topOffset: number;
  /** True from the moment play is engaged until the exit begins. */
  onExpandedChange: (expanded: boolean) => void;
}

/** Height of the framed panel's title bar; the canvas sits below it. */
const TITLE_BAR = 30;

// Two identical keyframes: swapping the name restarts the fade each time the
// panel changes size. The renderer clears its canvas when it resizes, so the
// fade from black also covers that one blank frame.
const fadeStyles = `
@keyframes field-panel-in-a { from { opacity: 0 } to { opacity: 1 } }
@keyframes field-panel-in-b { from { opacity: 0 } to { opacity: 1 } }
`;

// The DEEP FIELD as a framed viewport inside the page, not as the page.
// Framed, it only listens to the pointer over itself (`inputScope:
// 'container'`), so links and text beside it never steer or burn it. PLAY
// expands the same element to fill the viewport under the header; leaving
// play returns it to its frame. The canvas never remounts: the stage follows
// its container through a ResizeObserver.
const FieldPanel = ({ topOffset, onExpandedChange }: FieldPanelProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DeepFieldHandle | null>(null);
  const [mode, setMode] = useState<DeepFieldMode>('title');

  useEffect(() => {
    if (!containerRef.current) return;
    const handle = createDeepField(containerRef.current, {
      onMode: setMode,
      inputScope: 'container',
    });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.dispose();
    };
  }, []);

  const expanded = mode === 'engage' || mode === 'play';
  const playVisible = mode === 'title';
  const exitVisible = mode === 'play';

  useEffect(() => {
    onExpandedChange(expanded);
  }, [expanded, onExpandedChange]);

  // The page must not scroll under the expanded field (wheel, Space and the
  // arrow keys are flight controls there).
  useEffect(() => {
    if (!expanded) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [expanded]);

  return (
    // The slot keeps its place in the layout while the panel is expanded.
    <Box position="relative" flex="1" minH={{ base: '250px', lg: '260px' }}>
      <style>{fadeStyles}</style>
      <Box
        as="section"
        aria-label="Deep Field viewport"
        position={expanded ? 'fixed' : 'absolute'}
        top={expanded ? `${topOffset}px` : 0}
        left={0}
        right={0}
        bottom={0}
        zIndex={expanded ? 900 : undefined}
        bg="black"
        borderWidth="1px"
        borderColor={expanded ? 'transparent' : grey.border}
        overflow="hidden"
      >
        <Box
          ref={containerRef}
          position="absolute"
          top={expanded ? 0 : `${TITLE_BAR}px`}
          left={0}
          right={0}
          bottom={0}
          // framed: a finger on the panel still scrolls the page; expanded:
          // drags steer
          touchAction={expanded ? 'none' : 'pan-y'}
          animation={`${expanded ? 'field-panel-in-a' : 'field-panel-in-b'} 500ms ease both`}
        />

        <Flex
          position="absolute"
          top={0}
          left={0}
          right={0}
          h={`${TITLE_BAR}px`}
          align="center"
          justify="space-between"
          gap="12px"
          px="12px"
          borderBottom={`1px solid ${grey.border}`}
          userSelect="none"
          whiteSpace="nowrap"
          visibility={expanded ? 'hidden' : 'visible'}
        >
          <Text {...label} fontSize="10px" color="white">
            Viewport · Deep Field
          </Text>
          <Text {...label} fontSize="10px" color={grey.dim} display={{ base: 'none', sm: 'block' }}>
            Own engine on three.js
          </Text>
        </Flex>

        <Flex
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          align="flex-end"
          justify={{ base: 'flex-end', md: 'space-between' }}
          gap="12px"
          p="12px"
          pointerEvents="none"
          userSelect="none"
          opacity={playVisible ? 1 : 0}
          transition="opacity 300ms ease"
        >
          <Text
            {...label}
            fontSize="10px"
            color={grey.dim}
            textShadow="0 0 8px black"
            // a mouse hint: hidden on touch screens and at phone widths
            display={{ base: 'none', md: 'block' }}
            css={{ '@media (hover: none)': { visibility: 'hidden' } }}
          >
            Cursor steers · Click burns
          </Text>
          <Box
            as="button"
            onClick={(e) => {
              e.currentTarget.blur();
              handleRef.current?.play();
            }}
            pointerEvents={playVisible ? 'auto' : 'none'}
            tabIndex={playVisible ? 0 : -1}
            aria-hidden={!playVisible}
            {...mono}
            fontSize="12px"
            fontWeight="bold"
            letterSpacing="0.3em"
            px="18px"
            py="9px"
            bg="rgba(0,0,0,.7)"
            borderWidth="1px"
            borderColor={grey.border}
            borderRadius={0}
            cursor="pointer"
            flexShrink={0}
            whiteSpace="nowrap"
            transition="border-color 0.15s ease"
            _hover={{ borderColor: 'white' }}
            _focusVisible={{ borderColor: 'white' }}
          >
            ▶ PLAY
          </Box>
        </Flex>

        <Box
          as="button"
          onClick={(e) => {
            e.currentTarget.blur();
            handleRef.current?.exit();
          }}
          aria-label="Exit to the home page"
          position="absolute"
          bottom="16px"
          right="22px"
          {...label}
          fontSize="12px"
          letterSpacing="0.25em"
          color={grey.dim}
          bg="transparent"
          pointerEvents={exitVisible ? 'auto' : 'none'}
          tabIndex={exitVisible ? 0 : -1}
          aria-hidden={!exitVisible}
          cursor="pointer"
          userSelect="none"
          opacity={exitVisible ? 1 : 0}
          transition="opacity 600ms ease"
          _hover={{ color: 'white' }}
        >
          EXIT — ESC
        </Box>
      </Box>
    </Box>
  );
};

export default FieldPanel;
