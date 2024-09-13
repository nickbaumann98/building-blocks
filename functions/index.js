const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Create a transporter using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: functions.config().gmail.email,
    pass: functions.config().gmail.password
  }
});

exports.sendNewPostNotification = functions.firestore
    .document('posts/{postId}')
    .onCreate(async (snap, context) => {
        const newPost = snap.data();
        const postId = context.params.postId;

        // Get the author's subscribers
        const authorId = newPost.authorId;
        const subscribersSnapshot = await admin.firestore()
            .collection('subscriptions')
            .where('targetId', '==', authorId)
            .where('type', '==', 'author_publish')
            .get();

        const subscribers = subscribersSnapshot.docs.map(doc => doc.data().userId);

        // Prepare email content
        const emailContent = `
            New post from ${newPost.authorName || 'an author you follow'}:
            
            Title: ${newPost.title}
            
            Preview: ${newPost.blocks[0].content.substring(0, 200)}...
            
            Read more: https://buildingblocks.space/post/${postId}
        `;

        // Send email to each subscriber
        const sendEmailPromises = subscribers.map(async (subscriberId) => {
            const userDoc = await admin.firestore().collection('users').doc(subscriberId).get();
            const userEmail = userDoc.data().email;

            if (userEmail) {
                const mailOptions = {
                    from: 'Building Blocks <buildingblocks.notifications@gmail.com>',
                    to: userEmail,
                    subject: `New post from ${newPost.authorName || 'an author you follow'}`,
                    text: emailContent
                };

                try {
                    await transporter.sendMail(mailOptions);
                    console.log('Successfully sent email to:', userEmail);
                } catch (error) {
                    console.error('Error sending email to', userEmail, error);
                }
            } else {
                console.log('No email found for user:', subscriberId);
            }
        });

        await Promise.all(sendEmailPromises);

        console.log('Notification emails sent for new post:', postId);
    });

// Test function to simulate post creation and trigger the notification
exports.testNewPostNotification = functions.https.onRequest(async (req, res) => {
    try {
        const testPost = {
            title: 'Test Post Title',
            authorId: 'testAuthorId',
            authorName: 'Test Author',
            blocks: [{ content: 'This is a test post content. It should trigger a notification to all subscribers.' }],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            published: true
        };

        const postRef = await admin.firestore().collection('posts').add(testPost);
        
        res.status(200).send(`Test post created with ID: ${postRef.id}. Check Firebase Functions logs for notification details.`);
    } catch (error) {
        console.error('Error in test function:', error);
        res.status(500).send('Error creating test post: ' + error.message);
    }
});