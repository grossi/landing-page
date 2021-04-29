import * as React from "react";
import { SimpleGrid, Container, GridItem } from "@chakra-ui/react";
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
    <React.Fragment>
      <Header />
      <Container maxW="container.xl">
        <SimpleGrid columns={[4, null, 8, 12]} spacing={[4, null, 6, 12]}>
          <GridItem colSpan={[4, null, 6, 9]} mx={[2, 4, 6]} my={4}>
            <Markdown children={text} />
          </GridItem>
          <GridItem colSpan={[4, null, 2, 3]} mx={[2, null, null, 4, 6]} my={4}>
            <Sidebar socialInfo={props.sidebarInfo.socialInfo} />
          </GridItem>
        </SimpleGrid>
      </Container>
    </React.Fragment>
  );
};

export default Post;
