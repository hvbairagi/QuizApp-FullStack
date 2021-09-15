const express = require("express");
const app = express();
const path = require("path");

const { mongoose } = require("./db/mongoose");

const bodyParser = require("body-parser");

//Load in the mongoose models
const { QuestionPaper, Question, User } = require("./db/models/index");
const jwt = require("jsonwebtoken");

/** MIDDLEWARE */

//LOAD middleware
app.use(bodyParser.json());

// CORS HEADERS MIDDLEWARE
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id"
  );
  res.header(
    "Access-Control-Expose-Headers",
    "x-access-token , x-refresh-token"
  );
  next();
});

// check whether the request has a valid JWT access token
let authenticate = (req, res, next) => {
  let token = req.header("x-access-token");

  // verify JWT
  jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
    if (err) {
      // there ws an error
      // jwt is invalid - * DO NOT AUTHENTICATE *
      res.status(401).send(err);
    } else {
      // jwt is valid
      req.user_id = decoded._id;
      next();
    }
  });
};

// Verify Refresh Token MiddleWare (which will be verifying the session)
let verifySession = (req, res, next) => {
  // grab the refresh token from header
  let refreshToken = req.header("x-refresh-token");

  // grab the _id from the request header
  let _id = req.header("_id");

  User.findByIdAndToken(_id, refreshToken)
    .then((user) => {
      if (!user) {
        // user couldn't be found
        return Promise.reject({
          error:
            "User not found. Make Sure that the refresh token and user id are correct",
        });
      }
      // if the code reaches here - the user was found
      // therefore the refresh token exists in the database - but we still have to check if it
      // has expired or not
      req.user_id = user._id;
      req.userObject = user;
      req.refreshToken = refreshToken;

      let isSessionValid = false;

      user.sessions.forEach((session) => {
        if (session.token === refreshToken) {
          // check if the session has expired
          if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
            // refresh token has not expired
            isSessionValid = true;
          }
        }
      });

      if (isSessionValid) {
        // the session is VALID - call next() to continue processing this web request
        next();
      } else {
        // the session is not valid
        return Promise.reject({
          error: "Refresh token has expired or the session is invalid",
        });
      }
    })
    .catch((e) => {
      res.status(401).send(e);
    });
};

/** END MIDDLEWARE */

/* ROUTE HANDLERS */

/* QUESTIONPAPER ROUTES */

/*
 *GET /papers
 *Purpose: Get all papers
 */
app.get("/papers", authenticate, (req, res) => {
  // we want to return an array of all the papers in the database that belong to the authenticated user
  QuestionPaper.find({
    _userId: req.user_id,
  })
    .then((papers) => {
      res.send(papers);
    })
    .catch((e) => {
      res.send(e);
    });
});

/**
 * POST /papers
 * Purpose: Create a paper
 */

app.post("/papers", authenticate, (req, res) => {
  // we want to create a new paper and return the new paper document back to the user which
  // includes the id
  // the paper information (fields) will be passed in via the JSON request body
  let title = req.body.title;
  let newPaper = new QuestionPaper({
    title,
    _userId: req.user_id,
  });
  newPaper.save().then((paperDoc) => {
    // the full paper document is returned (including id)
    res.send(paperDoc);
  });
});

/**
 * PATCH /papers/:id
 * Purpose: Update a specified paper
 */

app.patch("/papers/:id", authenticate, (req, res) => {
  // we want to update the specified paper(paper document with id in the url) with the
  // new values specified in the JSON body of the request
  QuestionPaper.findOneAndUpdate(
    { _id: req.params.id, _userId: req.user_id },
    {
      $set: req.body,
    }
  ).then(() => {
    res.send({ message: "Updated successfully!" });
  });
});

/**
 * DELETE /papers/:id
 * Purpose: delete a specified paper
 */

app.delete("/papers/:id", authenticate, (req, res) => {
  // we want to delete the specified paper
  QuestionPaper.findOneAndRemove({
    _id: req.params.id,
    _userId: req.user_id,
  }).then((removedPaperDoc) => {
    res.send(removedPaperDoc);

    // delete all the questions that are in the deleted paper
    deleteQuestionsFromPaper(removedPaperDoc._id);
  });
});

/**
 * GET /papers/:paperId/questions
 * Purpose: Get all questions in a specific paper
 */

app.get("/papers/:paperId/questions", authenticate, (req, res) => {
  // we want to return all questions that belong to a specific paper (specified by paperId)
  Question.find({
    _paperId: req.params.paperId,
  }).then((questions) => {
    res.send(questions);
  });
});

app.get("/papers/:paperId/questions/:questionId", (req, res) => {
  Question.findOne({
    _id: req.params.questionId,
    _paperId: req.params.paperId,
  }).then((question) => {
    res.send(question);
  });
});

/**
 * POST /papers/:paperId/questions
 * Purpose: Create a new question in a specific paper
 */

app.post("/papers/:paperId/questions", authenticate, (req, res) => {
  // We want to create a new question in the paper specified by paperId

  QuestionPaper.findOne({
    _id: req.params.paperId,
    _userId: req.user_id,
  })
    .then((paper) => {
      if (paper) {
        // paper object with the specified conditions was found
        // therefore the currently authenticated user can create new questions
        return true;
      }
      // else the paper object is undefined
      return false;
    })
    .then((canCreateQuestion) => {
      if (canCreateQuestion) {
        let newQuestion = new Question({
          title: req.body.title,
          _paperId: req.params.paperId,
        });
        newQuestion.save().then((newQuestionDoc) => {
          res.send(newQuestionDoc);
        });
      } else {
        res.sendStatus(404);
      }
    });
});

/**
 * PATCH /papers/:paperId/questions/questionId
 * Purpose: Update and existing question
 */
app.patch(
  "/papers/:paperId/questions/:questionId",
  authenticate,
  (req, res) => {
    // We want to update an existing question (specified by questionId)

    QuestionPaper.findOne({
      _id: req.params.paperId,
      _userId: req.user_id,
    })
      .then((paper) => {
        if (paper) {
          // paper object with the specified conditions was found
          // therefore the currently authenticated user can make updates to questions within this paper
          return true;
        }
        // else the paper object is undefined
        return false;
      })
      .then((canUpdateQuestions) => {
        if (canUpdateQuestions) {
          // the currently authenticated user can update questions
          Question.findOneAndUpdate(
            { _id: req.params.questionId, _paperId: req.params.paperId },
            {
              $set: req.body,
            }
          ).then(() => {
            res.send({ message: "Updated successfully!" });
          });
        } else {
          res.sendStatus(404);
        }
      });
  }
);

/**
 * DELETE /papers/:paperId/questions/:questionId
 * Purpose: Delete a question
 */
app.delete(
  "/papers/:paperId/questions/:questionId",
  authenticate,
  (req, res) => {
    QuestionPaper.findOne({
      _id: req.params.paperId,
      _userId: req.user_id,
    })
      .then((paper) => {
        if (paper) {
          // paper object with the specified conditions was found
          // therefore the currently authenticated user can make updates to questions within this paper
          console.log("found paper: " + paper);
          return true;
        }
        // else the paper object is undefined
        console.log("did not found paper: " + paper);
        return false;
      })
      .then((canDeleteQuestions) => {
        if (canDeleteQuestions) {
          Question.findOneAndRemove({
            _id: req.params.questionId,
            _paperId: req.params.paperId,
          }).then((removedQuestionDoc) => {
            res.send(removedQuestionDoc);
          });
        } else {
          console.log(canDeleteQuestions);
          res.sendStatus(404);
        }
      });
  }
);

/** USER ROUTES */
/**
 * POST /users
 * Purpose: Sign up
 */
app.post("/users", (req, res) => {
  // User sign up
  let body = req.body;
  let newUser = new User(body);

  newUser
    .save()
    .then(() => {
      return newUser.createSession();
    })
    .then((refreshToken) => {
      // Session has been created successfully
      // now we generate an access auth token for the user
      return newUser
        .generateAccessAuthToken()
        .then((accessToken) => {
          // access auth token generated successfully, now we return an object containing the auth tokens
          return { accessToken, refreshToken };
        })
        .then((authTokens) => {
          // Now we construct and send the response to the user with their auth token in header and
          // the user object in the body
          res
            .header("x-refresh-token", authTokens.refreshToken)
            .header("x-access-token", authTokens.accessToken)
            .send(newUser);
        })
        .catch((e) => {
          res.status(400).send(e);
        });
    });
});

/**
 * POST /users/login
 * Purpose: Login
 */
app.post("/users/login", (req, res) => {
  let email = req.body.email;
  let password = req.body.password;

  User.findByCredentials(email, password)
    .then((user) => {
      return user
        .createSession()
        .then((refreshToken) => {
          // Session created successfully
          // now we generate an access auth token for the user

          return user.generateAccessAuthToken().then((accessToken) => {
            // Access auth token generated successfully, now we return an object containing the auth tokens
            return { accessToken, refreshToken };
          });
        })
        .then((authTokens) => {
          // Now we construct and send the response to the user with their auth token in header and
          // the user object in the body
          res
            .header("x-refresh-token", authTokens.refreshToken)
            .header("x-access-token", authTokens.accessToken)
            .send(user);
        });
    })
    .catch((e) => {
      res.status(400).send(e);
    });
});

/**
 * GET users/me/access-token
 * Purpose: generates and returns an access token
 */
app.get("/users/me/access-token", verifySession, (req, res) => {
  // we know that the user/caller is authenticated and we have the user_id and user object available to us
  req.userObject
    .generateAccessAuthToken()
    .then((accessToken) => {
      res.header("x-access-token", accessToken).send({ accessToken });
    })
    .catch((e) => {
      res.status(400).send(e);
    });
});

/* HELPER METHOD */
let deleteQuestionsFromPaper = (_paperId) => {
  Question.deleteMany({
    _paperId,
  }).then(() => {
    console.log("Questions from " + _paperId + " were deleted!");
  });
};

app.use(express.static(path.join(__dirname + "public")));

//Running Front End index.html from backend.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server is listening on port 3000");
});
