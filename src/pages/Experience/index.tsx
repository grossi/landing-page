import React from 'react';
import { VStack } from '@chakra-ui/react';
import PageLayout from 'templates/PageLayout';
import ExperienceHeader from 'components/organisms/ExperienceHeader';
import Timeline from 'components/organisms/Timeline';
import { TimelineItem } from 'types/timeline';
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
