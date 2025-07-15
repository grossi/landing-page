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
import { motion, useScroll, useTransform } from 'framer-motion';
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

        <Box position="relative" w="full">
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

          <VStack gap={12} position="relative">
            {timelineData.map((item, index) => {
              const isLeft = index % 2 === 0;
              
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
                      w={{ base: 'full', md: '45%' }}
                      pr={{ base: 0, md: isLeft ? 8 : 0 }}
                      pl={{ base: 0, md: !isLeft ? 8 : 0 }}
                      textAlign={{ base: 'left', md: isLeft ? 'right' : 'left' }}
                      order={{ base: 1, md: isLeft ? 0 : 2 }}
                    >
                      <MotionBox
                        bg={cardBg}
                        p={6}
                        borderRadius="xl"
                        borderWidth={1}
                        borderColor={item.highlight ? highlightColor : borderColor}
                        shadow={item.highlight ? 'lg' : 'md'}
                        whileHover={{ scale: 1.02, shadow: 'xl' }}
                        transition={{ duration: 0.2 }}
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
                    >
                      <MotionCircle
                        size="60px"
                        bg={cardBg}
                        borderWidth={3}
                        borderColor={item.highlight ? highlightColor : lineColor}
                        zIndex={2}
                        whileHover={{ scale: 1.2 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Icon as={iconMap[item.icon]} boxSize={6} color={highlightColor} />
                      </MotionCircle>
                    </Box>

                    <Box
                      display={{ base: 'none', md: 'block' }}
                      w="45%"
                      order={{ md: isLeft ? 2 : 0 }}
                    />
                  </Flex>
                </MotionBox>
              );
            })}
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default Experience;