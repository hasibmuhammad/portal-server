import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

dotenv.config();

const app = express();

const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(
  cors({
    origin: ["https://assignment-portal-d23d4.web.app"],
    credentials: true,
  })
);
app.use(cookieParser());

// Custom Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    res.status(401).send({ message: "Unauthorized Access!" });
    process.exit(1);
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      res.status(401).send({ message: "Unauthorized Access!" });
      process.exit(1);
    }
    req.user = decoded;
    next();
  });
};

// MongoDB
const uri = process.env.MONGO_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const run = async () => {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // collections
    const assignmentCollection = client
      .db("assignmentPortal")
      .collection("assignments");
    const submittedCollection = client
      .db("assignmentPortal")
      .collection("submitted");

    // API
    app.get("/", async (req, res) => {
      res.send(`Welcome to the assignment portal backend`);
    });

    // jwt - set cookie
    app.post("/jwt", async (req, res) => {
      const payload = await req.body;

      const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    // clear cookie upon logout
    app.get("/logout", async (req, res) => {
      res.clearCookie("token").send({ success: true });
    });

    // Create assignment
    app.post("/create", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }

      const assignment = await req.body;

      const result = await assignmentCollection.insertOne(assignment);

      res.send(result);
    });

    // get assignments
    app.get("/assignments", async (req, res) => {
      const assignments = await assignmentCollection.find().toArray();

      res.send(assignments);
    });

    // Get assignment - based on difficulty, page and size
    app.get("/assignmentsbydifficulty", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);

      let filter = {};
      if (req.query.difficulty !== "") {
        filter = { difficulty: req.query.difficulty };
        // limit =
      }
      const result = await assignmentCollection
        .find(filter)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // Get assignment - based on only difficulty
    app.get("/assignmentbydiff", async (req, res) => {
      const filter = { difficulty: req.query.difficulty };
      const result = await assignmentCollection.find(filter).toArray();

      // console.log("difficulty: ", result);
      res.send(result);
    });

    // Get assignment by id
    app.get("/assignment/:id", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }

      const id = new ObjectId(req.params.id);

      const assignment = await assignmentCollection.findOne({ _id: id });

      console.log(assignment);
      if (assignment) {
        res.send({ success: true, assignment });
      } else {
        res.send({ success: false });
      }
    });

    // update assignment
    app.put("/update/:id", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }

      const info = await req.body;
      const { title, photo, marks, difficulty, due, description } = info;
      const options = {
        upsert: true,
      };
      const updateDoc = {
        $set: {
          title,
          photo,
          marks,
          difficulty,
          due,
          description,
        },
      };

      const updatedResult = await assignmentCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        updateDoc,
        options
      );

      res.send(updatedResult);
    });

    // Delete assignment by id
    app.delete("/delete/:id", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }
      const id = new ObjectId(req.params.id);

      const delRes = await assignmentCollection.deleteOne({ _id: id });

      res.send(delRes);
    });

    // Create submitted assignment
    app.post("/createSubmitted", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }

      const submittedAssignment = await req.body;
      const result = await submittedCollection.insertOne(submittedAssignment);
      res.send(result);
    });

    // get submitted assignments
    app.get("/submitted", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }

      const submittedAssignments = await submittedCollection
        .find({ status: "pending" })
        .toArray();

      res.send(submittedAssignments);
    });
    app.get("/myassignments", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }

      const myassignments = await submittedCollection
        .find({ submittedBy: await req.user.email })
        .toArray();

      res.send(myassignments);
    });

    // Update submitted Assignment after marking
    app.patch("/mark/:id", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }

      const data = await req.body;
      const id = new ObjectId(req.params.id);
      const filter = { _id: id };
      // const options = { upsert: true };

      const updateDoc = {
        $set: {
          givenMark: data.givenMark,
          feedback: data.feedback,
          gradedBy: data.gradedBy,
          status: data.status,
        },
      };

      const result = await submittedCollection.updateOne(filter, updateDoc);

      res.send(result);
    });

    app.get("/featured", async (req, res) => {
      const result = await assignmentCollection.find().limit(3).toArray();

      res.send(result);
    });

    // // get product according to page and size
    // app.get("/pagination", async (req, res) => {
    //   const page = parseInt(req.query.page);
    //   const size = parseInt(req.query.size);

    //   const result = await assignmentCollection
    //     .find()
    //     .skip(page * size)
    //     .limit(size)
    //     .toArray();

    //   res.send(result);
    // });
  } finally {
  }
};

run()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running at port: ${port}`);
    });
  })
  .catch(console.dir);
