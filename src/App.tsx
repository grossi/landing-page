import React from "react";
import { BrowserRouter, Route, Switch } from "react-router-dom";
import Main from "pages/Main";
import Blog from "pages/Blog";

function App() {
  return (
    <BrowserRouter>
      <Switch>
        <Route exact path="/" component={Main} />
        <Route path="/blog" component={Blog} />
      </Switch>
    </BrowserRouter>
  );
}

export default App;
