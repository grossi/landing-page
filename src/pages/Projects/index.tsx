import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  Grid,
  VStack,
  HStack,
  Image,
  Link,
  Icon,
  Badge,
} from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaGithub, FaExternalLinkAlt } from 'react-icons/fa';
import { useColorMode } from 'components/ui/color-mode';
import PageLayout from 'templates/PageLayout';

const MotionBox = motion.create(Box);

interface Project {
  id: number;
  title: string;
  description: string;
  image: string;
  tags: string[];
  github?: string;
  demo?: string;
  featured?: boolean;
}

const projects: Project[] = [
  {
    id: 1,
    title: 'AI-Powered Analytics Dashboard',
    description: 'Real-time data visualization platform with machine learning insights and predictive analytics.',
    image: 'https://via.placeholder.com/600x400/667eea/ffffff?text=Analytics+Dashboard',
    tags: ['React', 'TypeScript', 'D3.js', 'Python', 'TensorFlow'],
    github: '#',
    demo: '#',
    featured: true,
  },
  {
    id: 2,
    title: 'Collaborative Code Editor',
    description: 'Real-time collaborative coding environment with syntax highlighting and live preview.',
    image: 'https://via.placeholder.com/600x400/f56565/ffffff?text=Code+Editor',
    tags: ['Node.js', 'WebSockets', 'Monaco Editor', 'Docker'],
    github: '#',
    demo: '#',
  },
  {
    id: 3,
    title: 'E-Commerce Platform',
    description: 'Modern e-commerce solution with inventory management and payment integration.',
    image: 'https://via.placeholder.com/600x400/48bb78/ffffff?text=E-Commerce',
    tags: ['Next.js', 'Stripe', 'PostgreSQL', 'Redis'],
    github: '#',
    featured: true,
  },
  {
    id: 4,
    title: 'Social Media Analytics',
    description: 'Track and analyze social media performance across multiple platforms.',
    image: 'https://via.placeholder.com/600x400/ed8936/ffffff?text=Analytics',
    tags: ['Vue.js', 'GraphQL', 'AWS', 'Elasticsearch'],
    github: '#',
  },
  {
    id: 5,
    title: 'Mobile Banking App',
    description: 'Secure and intuitive mobile banking experience with biometric authentication.',
    image: 'https://via.placeholder.com/600x400/38b2ac/ffffff?text=Banking+App',
    tags: ['React Native', 'Node.js', 'MongoDB', 'JWT'],
    github: '#',
    demo: '#',
  },
  {
    id: 6,
    title: 'IoT Dashboard',
    description: 'Monitor and control IoT devices with real-time data streaming.',
    image: 'https://via.placeholder.com/600x400/9f7aea/ffffff?text=IoT+Dashboard',
    tags: ['React', 'MQTT', 'InfluxDB', 'Grafana'],
    github: '#',
  },
];

const Projects: React.FC = () => {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [hoveredProject, setHoveredProject] = useState<number | null>(null);
  const { colorMode } = useColorMode();

  const cardBg = colorMode === 'light' ? 'white' : 'gray.800';
  const borderColor = colorMode === 'light' ? 'gray.200' : 'gray.700';

  const allTags = Array.from(
    new Set(projects.flatMap((project) => project.tags))
  ).sort();

  const filteredProjects = selectedTag
    ? projects.filter((project) => project.tags.includes(selectedTag))
    : projects;

  return (
    <PageLayout>
      <VStack gap={12}>
        <VStack gap={4} textAlign="center">
          <Heading
            size="4xl"
            fontWeight="bold"
            bgGradient="linear(to-r, purple.400, pink.400)"
            bgClip="text"
          >
            Featured Projects
          </Heading>
          <Text fontSize="lg" color={{ base: 'gray.600', _dark: 'gray.400' }} maxW="2xl">
            Exploring the intersection of design and development through innovative solutions
          </Text>
        </VStack>

        <HStack
          wrap="wrap"
          gap={3}
          justify="center"
          p={4}
          bg={cardBg}
          borderRadius="xl"
          borderWidth={1}
          borderColor={borderColor}
        >
          <Badge
            size="lg"
            variant={selectedTag === null ? 'solid' : 'outline'}
            colorPalette="purple"
            cursor="pointer"
            onClick={() => setSelectedTag(null)}
            _hover={{ transform: 'scale(1.05)' }}
          >
            All Projects
          </Badge>
          {allTags.map((tag) => (
            <Badge
              key={tag}
              size="lg"
              variant={selectedTag === tag ? 'solid' : 'outline'}
              colorPalette="purple"
              cursor="pointer"
              onClick={() => setSelectedTag(tag)}
              _hover={{ transform: 'scale(1.05)' }}
            >
              {tag}
            </Badge>
          ))}
        </HStack>

        <Grid
          templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }}
          gap={8}
          w="full"
        >
          <AnimatePresence mode="popLayout">
            {filteredProjects.map((project, index) => (
              <MotionBox
                key={project.id}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                position="relative"
                bg={cardBg}
                borderRadius="xl"
                overflow="hidden"
                borderWidth={1}
                borderColor={borderColor}
                onMouseEnter={() => setHoveredProject(project.id)}
                onMouseLeave={() => setHoveredProject(null)}
                cursor="pointer"
                _hover={{
                  borderColor: 'purple.400',
                  shadow: 'xl',
                  transform: 'scale(1.02)',
                }}
              >
                <Box position="relative" overflow="hidden" h="200px">
                  <Image
                    src={project.image}
                    alt={project.title}
                    w="full"
                    h="full"
                    objectFit="cover"
                  />
                  <AnimatePresence>
                    {hoveredProject === project.id && (
                      <MotionBox
                        position="absolute"
                        top={0}
                        left={0}
                        right={0}
                        bottom={0}
                        bg="blackAlpha.700"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        gap={4}
                      >
                        {project.github && (
                          <Link href={project.github}>
                            <Icon
                              as={FaGithub}
                              boxSize={8}
                              color="white"
                              _hover={{ transform: 'scale(1.2)' }}
                            />
                          </Link>
                        )}
                        {project.demo && (
                          <Link href={project.demo}>
                            <Icon
                              as={FaExternalLinkAlt}
                              boxSize={7}
                              color="white"
                              _hover={{ transform: 'scale(1.2)' }}
                            />
                          </Link>
                        )}
                      </MotionBox>
                    )}
                  </AnimatePresence>
                  {project.featured && (
                    <Badge
                      position="absolute"
                      top={4}
                      right={4}
                      colorPalette="yellow"
                      size="sm"
                    >
                      Featured
                    </Badge>
                  )}
                </Box>

                <VStack align="start" p={6} gap={4}>
                  <Heading size="md" color={{ base: 'gray.800', _dark: 'white' }}>{project.title}</Heading>
                  <Text fontSize="sm" color={{ base: 'gray.600', _dark: 'gray.400' }}>
                    {project.description}
                  </Text>
                  <HStack wrap="wrap" gap={2}>
                    {project.tags.map((tag) => (
                      <Badge
                        key={tag}
                        size="sm"
                        colorPalette="purple"
                        variant="subtle"
                        _hover={{ bg: 'purple.500', color: 'white' }}
                        cursor="pointer"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setSelectedTag(tag);
                        }}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </HStack>
                </VStack>
              </MotionBox>
            ))}
          </AnimatePresence>
        </Grid>
      </VStack>
    </PageLayout>
  );
};

export default Projects;