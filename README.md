# solo-project-2
CPSC 3750 · Hosted on Netlify · Backend with JSON persistence · Focus: client/server interaction

Netlify URL: https://fantastic-gingersnap-acf129.netlify.app/

Backend Language used: Python/Flask

Explanation of JSON Persistence:

This workout application persists data on the server using a JSOn file. The Flask backend reads and writes workout records to the workouts.json file that is in my data folder. Once you startup the flask API, the server will then check if the JSOn file exists and that it has at least 30 records, and if it doesn't, it will seed the dataset with 30 workouts then save them to the file. 
