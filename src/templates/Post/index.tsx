import * as React from "react";
import { SimpleGrid, Container, GridItem, Box } from "@chakra-ui/react";
import Markdown from "components/atoms/Markdown";
import Header from "components/organisms/Header";
import Sidebar, { SidebarProps } from "components/organisms/Sidebar";

interface PostProps {
  text: string;
  sidebarInfo: SidebarProps;
}

const Post = (props: PostProps) => {
  const { text } = props;

  return (
    <Box bg={{ base: "white", _dark: "gray.800" }} minH="100vh" color={{ base: "gray.800", _dark: "white" }}>
      <Header />
      <Container maxW="container.xl">
        <SimpleGrid columns={{ base: 4, md: 8, lg: 12 }} gap={{ base: 4, md: 6, lg: 12 }}>
          <GridItem colSpan={{ base: 4, md: 6, lg: 9 }} mx={{ base: 2, md: 4, lg: 6 }} my={4}>
            <Markdown children={text} />
          </GridItem>
          <GridItem colSpan={{ base: 4, md: 2, lg: 3 }} mx={{ base: 2, md: 4, lg: 6 }} my={4}>
            <Sidebar socialInfo={props.sidebarInfo.socialInfo} />
          </GridItem>
        </SimpleGrid>
      </Container>
    </Box>
  );
};

export default Post;
