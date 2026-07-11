import React from 'react';
import { VStack } from '@chakra-ui/react';
import PageLayout from 'components/layout/PageLayout';
import ExperienceHeader from 'components/timeline/ExperienceHeader';
import Timeline from 'components/timeline/Timeline';
import { TimelineItem } from 'components/timeline/types';
import experienceData from 'assets/experience-data.json';

const timelineItems = experienceData.experiences as TimelineItem[];

const Experience: React.FC = () => {
  return (
    <PageLayout maxW="container.lg">
      <VStack gap={16}>
        <ExperienceHeader
          title="Professional Journey"
          subtitle="A decade of growth, learning, and building impactful solutions"
        />

        <Timeline items={timelineItems} />
      </VStack>
    </PageLayout>
  );
};

export default Experience;
