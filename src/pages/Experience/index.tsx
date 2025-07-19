import React from 'react';
import { Box, VStack } from '@chakra-ui/react';
import { useColorMode } from 'components/ui/color-mode';
import PageLayout from 'templates/PageLayout';
import ExperienceHeader from 'components/organisms/ExperienceHeader';
import Timeline from 'components/organisms/Timeline';
import { TimelineItem } from 'types/timeline';
import experienceData from 'assets/experience-data.json';

const Experience: React.FC = () => {
  const { colorMode } = useColorMode();

  // Transform data to match our types
  const timelineData: TimelineItem[] = experienceData.experiences.map(item => ({
    ...item,
    type: item.type as 'work' | 'education' | 'achievement'
  }));

  // Color theme configuration
  const colors = {
    cardBg: colorMode === 'light' ? 'white' : 'gray.800',
    borderColor: colorMode === 'light' ? 'gray.200' : 'gray.700',
    lineColor: colorMode === 'light' ? 'purple.200' : 'purple.700',
    highlightColor: colorMode === 'light' ? 'purple.500' : 'purple.400',
  };

  // Particle configuration - easily customizable
  const particleConfig = {
    icon: {
      count: 20,        // Number of particles for icon clicks
      size: 10,         // Particle size in pixels
      speed: 100,       // Particle travel speed
      duration: 0.8     // Animation duration in seconds
    },
    card: {
      count: 32,        // Number of particles for card clicks
      size: 10,         // Particle size in pixels  
      speed: 80,        // Particle travel speed (slower than icons)
      duration: 0.8     // Animation duration in seconds
    }
  };

  // Color palette mapping for badges
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
    <PageLayout maxW="container.lg">
      <VStack gap={16}>
        <ExperienceHeader
          title="Professional Journey"
          subtitle="A decade of growth, learning, and building impactful solutions"
        />
        
        <Timeline
          items={timelineData}
          colors={colors}
          getColorPalette={getColorPalette}
          particleConfig={particleConfig}
        />
      </VStack>
    </PageLayout>
  );
};

export default Experience;