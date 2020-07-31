const io = require("socket.io")();
const getWords = require("./wordList").getWord;
// TODO LIST:
// - Make all the data here and there into one big users object (ket is socket is and values is an object with more infomation)


let users = {};
let usersReady = [];
let roundIsRunning = false;
let currentRoundID = null;
let roundTimeInterval = 30 * 1000;
let gameHost = null;
let currentDrawer = {};
const canvasBlankData = '{"lines":[{"points":[{"x":null,"y":null}, {"x":null,"y":null}],"brushColor":"#fff","brushRadius":0}],"width":"100%","height":"100%"}';
let latestCanvasData = {};
let endlessMode = false;
let currentRoundWord = "";
let usersThatGuessedCorrectly = [];

const welcomeMessage = "Hello and welcome to Scribblio! Please send '/ready' in the chat to let the server know you're ready to join a new game. On the left side there is a list of players with the color indicating their ready status.";
const gameAlreadyStartedMessage = "Lol you joined a bit too late. The game already started. Refresh when the current game ends to join.";


function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}


function setCanvas(CanvasData, sendingClient) {
    latestCanvasData = CanvasData;
    sendingClient.broadcast.emit("canvas-change", latestCanvasData);
};


function clearScreen() {
    latestCanvasData = canvasBlankData;
    io.emit("canvas-change", { sender: "Server", data: canvasBlankData });
    console.log("Cleared Screen!");
}


// Add checker for all users ready or no
function allUsersReady() {
    // Sort and convert to strings since we cant compare arrays directly
    const stringifiedUsers = JSON.stringify(Object.values(users).sort());
    const stringifiedUsersThatAreReady = JSON.stringify(usersReady.sort());
    console.log("users in game: " + stringifiedUsers);
    console.log("users that are ready: " + stringifiedUsersThatAreReady);
    if (stringifiedUsers === stringifiedUsersThatAreReady) {
        return true;
    }
    return false;
}


function setDrawer(drawerData) {
    // currentDrawer = {name: __, id: __}
    currentDrawer = drawerData;
    io.emit("drawer-change", drawerData.name);
};


// ADD CLEAR TIMEOUT TO MAKE THIS CLEANER
function runRound(id) {
    console.log("Started round.");
    roundIsRunning = true;
    clearScreen();
    // Assign new drawer
    let drawerID = getRandomElement(Object.keys(users));
    let drawerName = users[drawerID];
    // Get word for round
    currentRoundWord = getWords();
    // Set and broadcast drawer
    setDrawer({ name: drawerName, id: drawerID });
    io.emit("send-message", { sender: "Server", content: `The drawer is ${currentDrawer.name}` });
    io.to(currentDrawer.id).emit("send-message", { sender: "Server", content: `Your Word is ${currentRoundWord}` });

    io.emit("round-started", roundTimeInterval);
    // Give user some time to draw
    setTimeout(() => {
        // Check round running still (everyone left? --> dont send message) and round id --> left and came back starting new round
        if (roundIsRunning && id == currentRoundID) {
            io.emit("send-message", { sender: "Server", content: `Time's Up! The word was ${currentRoundWord}.` });
            currentRoundWord = null;
            console.log("Ended game after successful round");
            io.emit("round-ended");
            if (endlessMode) {
                // If in endless mode start new round
                io.emit("round-ended");
                console.log("Endless mode: starting new round");
                setDrawer({ name: "no one", id: null });
                clearScreen();
                setTimeout(() => {
                    currentRoundID = Math.random();
                    runRound(currentRoundID);
                }, 2000);

            } else {
                roundIsRunning = false;
                usersReady = [];
                io.emit("ready-change", usersReady);
                io.emit("round-ended");
            }
        } else {
            console.log("ERROR: ROUND IDs DON'T MATCH");
            console.log("Hoped to execute callback after timeout but round ended unexpectedly.");
            console.log("Round running: " + roundIsRunning);
            console.log("current/passed round id: " + currentRoundID + " " + id);
        }
    }, roundTimeInterval);

}









io.on("connect", (client) => {
    // If a round is running already disconnect the client
    if (roundIsRunning) {
        client.emit("send-message", { sender: "Server", content: gameAlreadyStartedMessage });
        client.disconnect();
    }

    // Send the newly connected client a list of connected ppl (not them tho bc they haven't sent username yet)
    client.emit("user-list", Object.values(users));
    client.emit("new-host", gameHost);
    client.emit("ready-change", usersReady);




    // ALl the other stuff happend once the client connects with their username
    client.on("send-username", userThatJoined => {
        // Add client to userlist and send a message that (they have joined + update userlist)
        users[client.id] = userThatJoined;
        const joinMessage = `has joined the server.`
        io.emit("send-message", { username: userThatJoined, content: joinMessage, type: "meta-join" });
        io.emit("user-list", Object.values(users));
        client.emit("send-message", { sender: "Server", content: welcomeMessage });
        client.emit("canvas-change", latestCanvasData);


        // If this client is the first to connect make the client host and drawer
        if (Object.keys(users).length === 1) {
            gameHost = userThatJoined;
            io.emit("new-host", gameHost);
            setDrawer({ name: userThatJoined, id: client.id });
        }





        client.on("send-message", msg => {
            let nameOfSender = users[client.id];
            console.log(nameOfSender + ": " + msg);

            let msgArray = msg.toLowerCase().split(" ");

            // Logic to start game once everyone says "/ready"
            if (msg.toLowerCase() === "/ready" && !roundIsRunning) {
                if (!roundIsRunning) {
                    // console.log("got ready message and round was not running.");
                    if (!usersReady.includes(nameOfSender)) {
                        usersReady.push(nameOfSender);
                        // io.emit("send-message", { sender: "Server", content: `${nameOfSender} is ready!` });
                        io.emit("ready-change", usersReady);
                    }

                    if (allUsersReady()) {
                        console.log("All users ready!");
                        // THIS SHOULD BE A CONTIUOUS POPUP THING NOT A MESSAGE
                        io.emit("send-message", { sender: "Server", content: `All users are ready! ${gameHost} needs to say '/start' to begin the game.` })
                    }
                } else {
                    console.log("got ready message but round was already running.")
                }
            } else if (msg.toLowerCase() === "/unready" && !roundIsRunning) {
                if (usersReady.includes(nameOfSender)) {
                    usersReady = usersReady.filter(username => {
                        return username !== nameOfSender;
                    });
                    // io.emit("send-message", { sender: "Server", content: `${nameOfSender} is ready!` });
                    io.emit("ready-change", usersReady);
                }
            } else if (msgArray[0] === "/start" && !roundIsRunning) {
                if (msgArray.length == 1) {
                    client.emit("send-message", { sender: "Server", content: "Enter a time interval. For example '/start 40'" });
                } else if (isNaN(msgArray[1])) {
                    client.emit("send-message", { sender: "Server", content: `${msgArray[1]} is not a number` });
                } else if (msgArray.length !== 2 && msgArray[2] !== "endless" && /\S/.test(msgArray[2])) {
                    client.emit("send-message", { sender: "Server", content: "Too much information!" });
                } else {
                    if (msgArray[2] == "endless") {
                        endlessMode = true;
                    }
                    roundTimeInterval = 1000 * Number(msgArray[1]);
                    if (nameOfSender === gameHost) {
                        if (allUsersReady()) {
                            currentRoundID = Math.random();
                            runRound(currentRoundID);
                        } else {
                            client.emit("send-message", { sender: "Server", content: "Can't start bc some ppl aren't ready. Check the left pane." });
                        }
                    } else {
                        client.emit("send-message", { sender: "Server", content: "You're not the host bro stop trying to start the game." });
                    }
                }

            } else if (msg.toLowerCase() === "/end" && roundIsRunning) {
                roundIsRunning = false;
                currentRoundID = null;
                usersReady = [];
                endlessMode = false;
                io.emit("ready-change", usersReady);
                io.emit("send-message", { sender: "Server", content: "Ended round." });
                io.emit("round-ended");
            } else if (roundIsRunning) {
                if (nameOfSender!==currentDrawer.name && currentRoundWord !== null && msg.toLowerCase() === currentRoundWord.toLowerCase()) {
                    // If someone guessed the word: emit the message that they guessed it
                    io.emit("send-message", { username: nameOfSender, content: " guessed the word!", type: "meta-join" });
                    if (nameOfSender !== currentDrawer.name) {
                        // Append name of sender to an array if it wasnt the drawer
                        usersThatGuessedCorrectly.push(nameOfSender);
                    }
                    let listOfUsersExceptDrawer = Object.values(users).filter(name => name !== currentDrawer.name);
                    if (JSON.stringify(usersThatGuessedCorrectly.sort()) === JSON.stringify(listOfUsersExceptDrawer.sort())) {
                        io.emit("round-ended");
                        if (endlessMode) {
                            usersThatGuessedCorrectly = [];
                            currentRoundID = Math.random();
                            runRound(currentRoundID);
                        } else {
                            roundIsRunning = false;
                            currentRoundID = null;
                            usersReady = [];
                            usersThatGuessedCorrectly = [];
                            io.emit("ready-change", usersReady);
                            io.emit("send-message", { sender: "Server", content: "Ended round." });
                        }
                    }
                    // Check if everyone guessed the word by pushing to array of correctGuessers and then comparing if
                    // correctGuessers == users.
                    // If they're equal end the round.
                } else {
                    io.emit("send-message", { sender: nameOfSender, content: msg });
                }
            } else {
                io.emit("send-message", { sender: nameOfSender, content: msg });
                // setDrawer({name: nameOfSender, id: client.id});
            }


        });





        client.on("disconnect", () => {
            const userThatLeft = users[client.id];
            delete users[client.id];

            usersReady = usersReady.filter(username => {
                return username != userThatLeft;
            });
            console.log(userThatLeft + " left. New users list: " + Object.values(users));

            if (Object.keys(users).length === 0) {
                // If everyone left reset all defaults
                users = {};
                usersReady = [];
                roundIsRunning = false;
                currentRoundID = null;
                gameHost = null;
                latestCanvasData = "";
                console.log("No users active. Ended game and reset all defaults.");
            }

            // emit the leave message
            const leaveMessage = `has left the server.`
            io.emit("send-message", { username: userThatLeft, content: leaveMessage, type: "meta-leave" });
            io.emit("user-list", Object.values(users));

            if (gameHost === userThatLeft) {
                // If the game host was the one that left pick a random dude from everyone else to be host
                gameHost = getRandomElement(Object.values(users));
                io.emit("new-host", gameHost);
                io.emit("send-message", { sender: "Server", content: `The new host is ${gameHost}` });
                if (!roundIsRunning) {
                    // Make host drawer if not in middle of a game
                    currentDrawer = gameHost
                    io.emit("drawer-change", currentDrawer);
                }
            }

        });







        client.on("canvas-change", canvasData => {
            if (canvasData.data === latestCanvasData.data) {
                console.log("ERROR: SAME DATA")
            } else {
                console.log("Canvas changed");
                // console.log("OLD DATA: " + latestCanvasData.data);
                // console.log("NEW DATA: " + canvasData.data);
                setCanvas(canvasData, client);
            }
        });



        client.on("clear-canvas", () => {
            clearScreen();
        });


        client.on("undo-canvas", () => {
            if (latestCanvasData !== canvasBlankData) {
                // console.log(latestCanvasData);
                setDrawer({ name: "no one", id: null });
                // console.log("DATA TO UNDO:" + (latestCanvasData));
                let dataToUndo = JSON.parse(latestCanvasData.data);
                // console.log("________________________");
                // console.log(dataToUndo.lines);
                dataToUndo.lines.pop();
                // console.log("AFTER CHAGNE");
                // console.log(dataToUndo.lines);
                latestCanvasData.data = JSON.stringify(dataToUndo);
                if (dataToUndo.lines.length === 0) {
                    clearScreen();
                } else {
                    io.emit("canvas-change", { sender: users[client.id], data: latestCanvasData.data });
                }
                setDrawer({ name: users[client.id], id: client.id });
            }
        });

    });
});

const port = process.env.PORT || 8000;
io.listen(port);
console.log(`Server started on port ${port}`);