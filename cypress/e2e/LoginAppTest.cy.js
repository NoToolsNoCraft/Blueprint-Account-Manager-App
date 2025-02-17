describe('Account Manager App - Cypress Test', () => {
  const baseUrl = 'https://account-manager-app-express-mong-production.up.railway.app';

  it('should test account creation, password change, login, and account deletion', () => {
    // Step 1: Navigate to the main page
    cy.visit(`${baseUrl}/`);

    // Step 2: Click on the "Create a new account" button
    cy.get('a[href="/signup"]').click();

    // Step 3: Verify navigation to the signup page
    cy.url().should('eq', `${baseUrl}/signup`);

    // Step 4: Fill in the signup form and submit
    cy.get('input[name="name"]').type('CypressUsername');
    cy.get('input[name="password"]').type('CypressPassword');
    cy.get('input.sub[type="submit"]').click();

    // Step 5: Verify navigation to the dashboard page
    cy.url().should('eq', `${baseUrl}/signup`);

    // Step 6: Change the password
    cy.get('input#oldPassword').type('CypressPassword');
    cy.get('input#newPassword').type('CypressNew');
    cy.get('button[type="submit"]').contains('Change Password').click();

    // Step 7: Verify success message
    cy.contains('p', 'Password successfully changed.').should('be.visible');

    // Step 8: Click "Go back to the homepage"
    cy.get('a[href="/home"]').click();

    // Step 9: Click on the logout button
    cy.get('button[type="submit"]').contains('Logout').click();

    // Step 10: Verify navigation back to the login page
    cy.url().should('eq', `${baseUrl}/`);

    // Step 11: Log in with the new password
    cy.get('input[name="name"]').type('CypressUsername');
    cy.get('input[name="password"]').type('CypressNew');
    cy.get('input.sub[type="submit"]').click();

    // Verify navigation to the homepage
    cy.url().should('eq', `${baseUrl}/login`);

    // Step 12: Delete the account
    cy.get('button[type="submit"]').contains('Delete Account').click();

    // Confirm the popup
    cy.on('window:confirm', (text) => {
      expect(text).to.eq('Are you sure you want to delete your account?');
      return true; // Click OK
    });

    // Verify navigation to the delete-account page
    cy.url().should('eq', `${baseUrl}/delete-account`);

    // Final step: Navigate back to the login page
    cy.get('a[href="/"]').click();
  });
});
