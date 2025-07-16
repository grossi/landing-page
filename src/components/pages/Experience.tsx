import React from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  Circle,
  Icon,
  Flex,
  Badge,
} from '@chakra-ui/react';
import { motion, useScroll, useTransform, useAnimation, AnimatePresence } from 'framer-motion';
import { FaBriefcase, FaGraduationCap, FaRocket, FaStar, FaGamepad, FaDesktop } from 'react-icons/fa';
import { useColorMode } from 'components/ui/color-mode';
import Header from '../organisms/Header';
import experienceData from '../../assets/experience-data.json';

const MotionBox = motion(Box);
const MotionCircle = motion(Circle);

interface TimelineItem {
  id: number;
  type: 'work' | 'education' | 'achievement';
  title: string;
  organization: string;
  period: string;
  description: string;
  skills: string[];
  icon: string;
  highlight?: boolean;
  projects?: Array<{
    name: string;
    url: string;
    repo: string;
  }>;
}

const iconMap: { [key: string]: any } = {
  FaBriefcase,
  FaGraduationCap,
  FaRocket,
  FaStar,
  FaGamepad,
  FaDesktop,
};

const timelineData: TimelineItem[] = experienceData.experiences.map(item => ({
  ...item,
  type: item.type as 'work' | 'education' | 'achievement'
}));

interface Particle {
  id: number;
  x: number;
  y: number;
}

const ParticleEffect: React.FC<{ particles: Particle[]; color: string; elementWidth: number; elementHeight: number; isCircle?: boolean }> = ({ particles, color, elementWidth, elementHeight, isCircle = false }) => {
  return (
    <AnimatePresence>
      {particles.map((particle, index) => {
        let normalizedX = 0;
        let normalizedY = 0;
        
        if (isCircle) {
          // For circular elements, calculate direction from center through particle position
          const centerX = elementWidth / 2 + 30; // Add offset for icon container
          const centerY = elementHeight / 2 + 30;
          const dirX = particle.x - centerX;
          const dirY = particle.y - centerY;
          const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
          normalizedX = magnitude > 0 ? (dirX / magnitude) * 100 : 0;
          normalizedY = magnitude > 0 ? (dirY / magnitude) * 100 : 0;
        } else {
          // For rectangular elements, calculate outward direction based on particle position
          const centerX = elementWidth / 2 + 20; // Add offset for card container
          const centerY = elementHeight / 2 + 20;
          const dirX = particle.x - centerX;
          const dirY = particle.y - centerY;
          const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
          normalizedX = magnitude > 0 ? (dirX / magnitude) * 80 : 0;
          normalizedY = magnitude > 0 ? (dirY / magnitude) * 80 : 0;
        }
        
        return (
          <MotionBox
            key={particle.id}
            position="absolute"
            left={`${particle.x}px`}
            top={`${particle.y}px`}
            w="10px"
            h="10px"
            bg={color}
            borderRadius="full"
            pointerEvents="none"
            zIndex={100}
            initial={{ scale: 0, opacity: 1, x: 0, y: 0 }}
            animate={{ 
              scale: [0, 2, 0],
              opacity: [1, 0.8, 0],
              x: normalizedX,
              y: normalizedY,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ transform: 'translate(-50%, -50%)' }}
          />
        );
      })}
    </AnimatePresence>
  );
};

const TimelineItemComponent: React.FC<{
  item: TimelineItem;
  index: number;
  colorMode: string;
  cardBg: string;
  borderColor: string;
  lineColor: string;
  highlightColor: string;
  getColorPalette: (type: string) => string;
}> = ({ item, index, colorMode, cardBg, borderColor, lineColor, highlightColor, getColorPalette }) => {
  const isLeft = index % 2 === 0;
  const iconControls = useAnimation();
  const cardControls = useAnimation();
  const [isIconHovered, setIsIconHovered] = React.useState(false);
  const [isCardHovered, setIsCardHovered] = React.useState(false);
  const [iconParticles, setIconParticles] = React.useState<Particle[]>([]);
  const [cardParticles, setCardParticles] = React.useState<Particle[]>([]);
  const [iconDimensions, setIconDimensions] = React.useState({ width: 0, height: 0 });
  const [cardDimensions, setCardDimensions] = React.useState({ width: 0, height: 0 });

  const createParticlesAroundBorder = (width: number, height: number, isCircle: boolean = false): Particle[] => {
    const particles: Particle[] = [];
    const particleCount = 16;
    
    if (isCircle) {
      // For circular elements (icons), place particles around the circle edge
      const radius = width / 2;
      const borderOffset = 5; // Start particles slightly outside the border
      const adjustedRadius = radius + borderOffset;
      
      for (let i = 0; i < particleCount; i++) {
        // Distribute particles evenly around the circle
        const angle = (i / particleCount) * Math.PI * 2;
        particles.push({
          id: Date.now() + i,
          x: radius + adjustedRadius * Math.cos(angle),
          y: radius + adjustedRadius * Math.sin(angle),
        });
      }
    } else {
      // For rectangular elements (cards), place particles around the perimeter
      const margin = -5; // Start particles outside the border
      const adjustedWidth = width - 2 * margin;
      const adjustedHeight = height - 2 * margin;
      const perimeter = 2 * (adjustedWidth + adjustedHeight);
      const spacing = perimeter / particleCount;
      
      for (let i = 0; i < particleCount; i++) {
        const distance = i * spacing;
        let x, y;
        
        if (distance < adjustedWidth) {
          // Top edge
          x = margin + distance;
          y = margin;
        } else if (distance < adjustedWidth + adjustedHeight) {
          // Right edge
          x = width - margin;
          y = margin + (distance - adjustedWidth);
        } else if (distance < 2 * adjustedWidth + adjustedHeight) {
          // Bottom edge
          x = width - margin - (distance - adjustedWidth - adjustedHeight);
          y = height - margin;
        } else {
          // Left edge
          x = margin;
          y = height - margin - (distance - 2 * adjustedWidth - adjustedHeight);
        }
        
        particles.push({ id: Date.now() + i, x, y });
      }
    }
    
    return particles;
  };

  const handleIconClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    
    setIconDimensions({ width: rect.width, height: rect.height });
    // Create particles positioned relative to the 120x120 container (60px offset from center)
    const particles = createParticlesAroundBorder(rect.width, rect.height, true);
    const offsetParticles = particles.map(p => ({
      ...p,
      x: p.x + 30, // Offset to center in 120x120 container
      y: p.y + 30
    }));
    setIconParticles(offsetParticles);
    setTimeout(() => setIconParticles([]), 800);
    
    await iconControls.start({ scale: 1.4 });
    await iconControls.start({ scale: isIconHovered ? 1.2 : 1 });
  };

  const handleCardClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    
    setCardDimensions({ width: rect.width, height: rect.height });
    // Create particles positioned relative to the extended container (20px padding on all sides)
    const particles = createParticlesAroundBorder(rect.width, rect.height, false);
    const offsetParticles = particles.map(p => ({
      ...p,
      x: p.x + 20, // Offset for the 20px padding
      y: p.y + 20
    }));
    setCardParticles(offsetParticles);
    setTimeout(() => setCardParticles([]), 800);
    
    await cardControls.start({ scale: 1.05 });
    await cardControls.start({ scale: isCardHovered ? 1.02 : 1 });
  };

  return (
    <MotionBox
      key={item.id}
      initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      w="full"
    >
      <Flex
        direction={{ base: 'column', md: 'row' }}
        align="center"
        justify="center"
        position="relative"
      >
        <Box
          w={{ base: 'full', md: '42%' }}
          pr={{ base: 0, md: isLeft ? 12 : 0 }}
          pl={{ base: 0, md: !isLeft ? 12 : 0 }}
          textAlign={{ base: 'left', md: isLeft ? 'right' : 'left' }}
          order={{ base: 1, md: isLeft ? 0 : 2 }}
          position="relative"
          overflow="visible"
        >
          {/* Particle container that extends beyond card boundaries */}
          <Box
            position="absolute"
            top="-20px"
            left="-20px"
            right="-20px"
            bottom="-20px"
            pointerEvents="none"
            overflow="visible"
            zIndex={100}
          >
            <ParticleEffect particles={cardParticles} color={highlightColor} elementWidth={cardDimensions.width} elementHeight={cardDimensions.height} isCircle={false} />
          </Box>
          <MotionBox
            bg={cardBg}
            p={6}
            borderRadius="xl"
            borderWidth={1}
            borderColor={item.highlight ? highlightColor : borderColor}
            shadow={item.highlight ? 'lg' : 'md'}
            whileHover={{ scale: 1.02, shadow: 'xl' }}
            transition={{ duration: 0.2 }}
            cursor="pointer"
            onClick={handleCardClick}
            animate={cardControls}
            onMouseEnter={() => setIsCardHovered(true)}
            onMouseLeave={() => setIsCardHovered(false)}
            position="relative"
            zIndex={10}
          >
            <HStack
              justify={{ base: 'flex-start', md: isLeft ? 'flex-end' : 'flex-start' }}
              mb={2}
            >
              <Badge colorPalette={getColorPalette(item.type)} size="sm">
                {item.type}
              </Badge>
              <Text fontSize="sm" color={{ base: 'gray.600', _dark: 'gray.400' }}>
                {item.period}
              </Text>
            </HStack>
            <Heading size="md" mb={1} color={{ base: 'gray.800', _dark: 'white' }}>
              {item.title}
            </Heading>
            <Text
              fontSize="sm"
              fontWeight="semibold"
              color={highlightColor}
              mb={3}
            >
              {item.organization}
            </Text>
            <Text fontSize="sm" color={{ base: 'gray.600', _dark: 'gray.400' }} mb={4}>
              {item.description}
            </Text>
            <HStack wrap="wrap" gap={2} justify={{ base: 'flex-start', md: isLeft ? 'flex-end' : 'flex-start' }}>
              {item.skills.map((skill) => (
                <Badge key={skill} size="sm" variant="subtle">
                  {skill}
                </Badge>
              ))}
            </HStack>
          </MotionBox>
        </Box>

        <Box
          position={{ base: 'relative', md: 'absolute' }}
          left={{ base: 'auto', md: '50%' }}
          transform={{ base: 'none', md: 'translateX(-50%)' }}
          order={{ base: 0, md: 1 }}
          mb={{ base: 4, md: 0 }}
          overflow="visible"
          zIndex={50}
        >
          {/* Particle container that allows overflow */}
          <Box
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            w="120px"
            h="120px"
            pointerEvents="none"
            overflow="visible"
            zIndex={100}
          >
            <ParticleEffect particles={iconParticles} color={highlightColor} elementWidth={iconDimensions.width} elementHeight={iconDimensions.height} isCircle={true} />
          </Box>
          <MotionCircle
            size="60px"
            bg={cardBg}
            borderWidth={3}
            borderColor={item.highlight ? highlightColor : lineColor}
            zIndex={50}
            whileHover={{ scale: 1.2 }}
            transition={{ duration: 0.2 }}
            cursor="pointer"
            onClick={handleIconClick}
            animate={iconControls}
            onMouseEnter={() => setIsIconHovered(true)}
            onMouseLeave={() => setIsIconHovered(false)}
            position="relative"
          >
            <Icon as={iconMap[item.icon]} boxSize={6} color={highlightColor} />
          </MotionCircle>
        </Box>

        <Box
          display={{ base: 'none', md: 'block' }}
          w="42%"
          order={{ md: isLeft ? 2 : 0 }}
        />
      </Flex>
    </MotionBox>
  );
};

const Experience: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const lineHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const { colorMode } = useColorMode();

  const bgColor = colorMode === 'light' ? 'gray.50' : 'gray.900';
  const cardBg = colorMode === 'light' ? 'white' : 'gray.800';
  const borderColor = colorMode === 'light' ? 'gray.200' : 'gray.700';
  const lineColor = colorMode === 'light' ? 'purple.200' : 'purple.700';
  const highlightColor = colorMode === 'light' ? 'purple.500' : 'purple.400';

  const getColorPalette = (type: string) => {
    switch (type) {
      case 'work':
        return 'blue';
      case 'education':
        return 'green';
      case 'achievement':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  return (
    <Box bg={bgColor} minH="100vh">
      <Header />
      <VStack gap={16} maxW="container.lg" mx="auto" px={4} py={12}>
        <VStack gap={4} textAlign="center">
          <Heading
            size="4xl"
            fontWeight="bold"
            bgGradient="linear(to-r, blue.400, purple.400)"
            bgClip="text"
          >
            Professional Journey
          </Heading>
          <Text fontSize="lg" color={{ base: 'gray.600', _dark: 'gray.400' }} maxW="2xl">
            A decade of growth, learning, and building impactful solutions
          </Text>
        </VStack>

        <Box position="relative" w="full" overflow="visible">
          <Box
            position="absolute"
            left="50%"
            transform="translateX(-50%)"
            w="2px"
            h="full"
            bg={lineColor}
          />
          
          <MotionBox
            position="absolute"
            left="50%"
            transform="translateX(-50%)"
            w="2px"
            bg={highlightColor}
            style={{ height: lineHeight }}
            initial={{ height: '0%' }}
          />

          <VStack gap={12} position="relative" overflow="visible">
            {timelineData.map((item, index) => (
              <TimelineItemComponent
                key={item.id}
                item={item}
                index={index}
                colorMode={colorMode}
                cardBg={cardBg}
                borderColor={borderColor}
                lineColor={lineColor}
                highlightColor={highlightColor}
                getColorPalette={getColorPalette}
              />
            ))}
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default Experience;