var http = require('http')
  ,gh = require('github3')
  ,assert = require('assert')
  ,util = require('util')
  
  
gh.setCredentials(process.env.npm_package_config_github_username,
                  process.env.npm_package_config_github_password)

// get our fellow citizens
people = []

gh.getOrgMembers(process.env.npm_package_config_github_orgName,function (error,data) {
  assert.equal(error,null,'Error getting citizens list - '+error)
  people = data.map(function (x) { return x.login })
  process.emit('citizens loaded')
})

process.on('citizens loaded', function () {
  gh.getPullRequests(
    process.env.npm_package_config_github_repo,
    process.env.npm_package_config_github_orgName,
    'open',
    function (error,pullreqs) {
      assert.equal(error,null,'Error getting pull requests list - '+error)
      pullreqs = pullreqs.filter(function (pullreq) { 
        // filter out all unfinished votings
        return ((new Date() - new Date(pullreq.created_at))>process.env.npm_package_config_voting_timeSpan)
      })
      pullreqs.forEach(function (pullreq){
        gh.getIssueComments(
          process.env.npm_package_config_github_repo,
          process.env.npm_package_config_github_orgName,
          pullreq.number,
          function (error,comments) {
            var
               votedUp = []
              ,votedDown = []
            assert.equal(error,null,'Error getting comments - '+error)
            // filter out all comments from non-citizens
            comments = comments.filter(function (comment){
              return (people.indexOf(comment.user.login)!=-1)
            })            
            comments.forEach(function (comment) {
              if (comment.body.indexOf('[VoteUp]')!=-1) {
                votedUp.push(comment.user.login)
              }
              else if (comment.body.indexOf('[VoteDown]')!=-1) {
                votedDown.push(comment.user.login)
              }
            })
            // important: decision criteria
            if (((votedUp.length + votedDown.length) > ( 0.3*people.length ) )) {
              if (votedUp.length > votedDown.length) {
                // success - merge pull request to master branch
                gh.mergePullRequest(
                  process.env.npm_package_config_github_repo,
                  process.env.npm_package_config_github_orgName,
                  pullreq.number,
                  function (error, data) {
                    assert.equal(error,null,'Error pull req merge request - '+util.inspect(error))                    
                    console.log('++++++'+data)
                  }
                )
              }              
              else {
                // failure - close pull request withoud merging
                gh.closePullRequest(
                  process.env.npm_package_config_github_repo,
                  process.env.npm_package_config_github_orgName,
                  pullreq.number,
                  function (error,data) {
                    assert.equal(error,null,'Error pull req close request - '+util.inspect(error))                    
                  }
                )
              }
            }
            else {
              // quorum threshold not reached - close pull request without merging
              gh.closePullRequest(
                process.env.npm_package_config_github_repo,
                process.env.npm_package_config_github_orgName,
                pullreq.number,
                function (error,data) {
                  assert.equal(error,null,'Error pull req close request (no quorum) - '+util.inspect(error))                    
                }
              )
            }
          }
        )
      })
    })
  })

// set up simple web-server
http.createServer(function (req,res) {
  res.writeHead(200,{})
  res.end("Hello, world! NomiNation version "+process.env.npm_package_version)
}).listen(process.env.PORT || 8001)

process.on('exit',function () {
  http.close()
})