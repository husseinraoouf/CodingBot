const {
  ObjectID
} = require('mongodb');


module.exports = ({ Users }, { userByID }) => {

    let methods = {}

    methods.adduser = async (sender_psid, name) => {

      const response = await Users.insert(
          { sender_psid, name },
      );

      console.log(response);

      return response;
    }

    methods.setDefaultLang = async (sender_psid, lang) => {

        const response = await Users.update(
            { sender_psid },
            { $set: { defaultlang: lang } }
        );

        console.log(response);

        return response;
    }

    return methods;
};
