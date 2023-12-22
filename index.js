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
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));
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
          secure: false,
          sameSite: false,
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

    // Get assignment - based on difficulty
    app.get("/assignmentsbydifficulty", async (req, res) => {
      const assignments = await assignmentCollection
        .find({ difficulty: req.query.difficulty })
        .toArray();

      res.send(assignments);
    });

    // Get assignment by id
    app.get("/assignment/:id", verifyToken, async (req, res) => {
      if ((await req.user.email) !== req.query.email) {
        res.status(403).send({ message: "Forbidden Access!" });
      }

      const id = new ObjectId(req.params.id);

      console.log(id);

      const assignment = await assignmentCollection.findOne({ _id: id });

      console.log(assignment);

      res.send(assignment);
    });
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
