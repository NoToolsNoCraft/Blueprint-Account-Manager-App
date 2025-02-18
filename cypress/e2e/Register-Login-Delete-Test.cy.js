Cypress.on('uncaught:exception', (err) => {
  console.error('Error:', err.message);
  return false;
});

describe('User Registration Flow', () => {
  const baseUrl = 'http://localhost:5002';

  it('should register a new user and return to the homepage', () => {
    // Navigate to the base URL
    cy.visit(baseUrl);

    // Click on the Register button
    cy.contains('Register').click();

    // Fill out the registration form
    cy.get('#username').type('testAccount');
    cy.get('#email').type('tnewspeak2@gmail.com');
    cy.get('#password').type('testPassword123');
    cy.get('#confirmPassword').type('testPassword123');

    // Submit the form
    cy.contains('Sign Up').click();

    // Verify registration success message
    cy.contains('Registration successful!').should('be.visible');

    // Click the "Click here" link to go back to homepage
    cy.contains('Click here').click();

    // Verify we are back on the base URL
    cy.url().should('eq', baseUrl + '/');

    // Login
    cy.contains('Login').click();
    cy.get('#name').type('testAccount');
    cy.get('#password').type('testPassword123');
    cy.contains('button', 'Login').click();
    cy.contains('Dashboard').should('be.visible');
    cy.contains('Hello testAccount').should('be.visible');

    // Delete account
    cy.contains('Delete Account').click();
    
    // Handle confirmation pop-up
    cy.on('window:confirm', (text) => {
      expect(text).to.equal('Are you sure you want to delete your account?');
      return true; // Accept confirmation
    });

    // Verify redirection to homepage
    cy.url().should('eq', baseUrl + '/');
    cy.contains('Welcome to Our App').should('be.visible');
    cy.contains('Please log in or register to continue.').should('be.visible');
    cy.contains('Login').should('be.visible');
    cy.contains('Register').should('be.visible');
  });
});
