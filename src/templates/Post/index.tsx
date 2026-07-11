import * as React from "react";
import { SimpleGrid, GridItem } from "@chakra-ui/react";
import Markdown from "components/atoms/Markdown";
import Sidebar from "components/organisms/Sidebar";
import PageLayout from "templates/PageLayout";

interface PostProps {
  text: string;
}

const Post = ({ text }: PostProps) => {
  return (
    <PageLayout maxW="container.xl" py={0}>
      <SimpleGrid columns={{ base: 4, md: 8, lg: 12 }} gap={{ base: 4, md: 6, lg: 12 }}>
        <GridItem colSpan={{ base: 4, md: 6, lg: 9 }} mx={{ base: 2, md: 4, lg: 6 }} my={4}>
          <Markdown>{text}</Markdown>
        </GridItem>
        <GridItem colSpan={{ base: 4, md: 2, lg: 3 }} mx={{ base: 2, md: 4, lg: 6 }} my={4}>
          <Sidebar />
        </GridItem>
      </SimpleGrid>
    </PageLayout>
  );
};

export default Post;
