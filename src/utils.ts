import _ from 'lodash'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as yaml from 'js-yaml'
import { Config } from './handler'
import { PullRequest } from './pull_request'

export function chooseReviewers(
  owner: string,
  config: Config,
  pr: PullRequest
): string[] {
  const { useReviewGroups, reviewGroups, numberOfReviewers, reviewers } = config
  let chosenReviewers: string[] = []
  const useGroups: boolean =
    useReviewGroups && Object.keys(reviewGroups).length > 0

  if (useGroups) {
    chosenReviewers = chooseUsersFromGroups(
      pr.assignKey(),
      owner,
      reviewGroups,
      numberOfReviewers
    )
  } else {
    chosenReviewers = chooseUsers(
      pr.assignKey(),
      reviewers,
      numberOfReviewers,
      owner
    )
  }

  return chosenReviewers
}

export function chooseAssignees(
  owner: string,
  config: Config,
  pr: PullRequest
): string[] {
  const {
    useAssigneeGroups,
    assigneeGroups,
    addAssignees,
    numberOfAssignees,
    numberOfReviewers,
    assignees,
    reviewers,
  } = config
  let chosenAssignees: string[] = []

  const useGroups: boolean =
    useAssigneeGroups && Object.keys(assigneeGroups).length > 0

  if (typeof addAssignees === 'string') {
    if (addAssignees === 'reviewers') {
      throw new Error(
        "Reached `chooseAssignees` when addAssignees is set to 'reviewers'. This should not happen."
      )
    }
    chosenAssignees = [owner]
  } else if (useGroups) {
    chosenAssignees = chooseUsersFromGroups(
      pr.assignKey(),
      owner,
      assigneeGroups,
      numberOfAssignees || numberOfReviewers
    )
  } else {
    const candidates = assignees ? assignees : reviewers
    chosenAssignees = chooseUsers(
      pr.assignKey(),
      candidates,
      numberOfAssignees || numberOfReviewers,
      owner
    )
  }

  return chosenAssignees
}

// some low primes to shuffle the list
const primes = [1, 503, 521, 541, 599, 733]

export function chooseUsers(
  key: number,
  candidates: string[],
  desiredNumber: number,
  filterUser: string = ''
): string[] {
  const filteredCandidates = candidates.filter((reviewer: string): boolean => {
    return reviewer !== filterUser
  })

  core.info(
    `Assigning ${desiredNumber} Reviewers for PR (Key: ${key}). Creator: ${filterUser}. Candidates: ${filteredCandidates}`
  )

  // all-assign
  if (desiredNumber === 0) {
    return filteredCandidates
  }

  const result: string[] = []
  const numberToAssign = Math.min(desiredNumber, filteredCandidates.length)
  for (let i = 0; i < numberToAssign; i++) {
    const candidateIndex = (key * primes[i]) % filteredCandidates.length
    const assignee = filteredCandidates[candidateIndex]
    core.info(
      `Assigning ${assignee} (${key} * ${primes[i]} mod ${filteredCandidates.length}) = ${candidateIndex}`
    )
    result.push(assignee)
    filteredCandidates.splice(candidateIndex, 1)
    core.info(`Remaining candidates: ${filteredCandidates}`)
  }

  return result
}

export function includesSkipKeywords(
  title: string,
  skipKeywords: string[]
): boolean {
  for (const skipKeyword of skipKeywords) {
    if (title.toLowerCase().includes(skipKeyword.toLowerCase()) === true) {
      return true
    }
  }

  return false
}

export function chooseUsersFromGroups(
  key: number,
  owner: string,
  groups: { [key: string]: string[] } | undefined,
  desiredNumber: number
): string[] {
  let users: string[] = []
  for (const group in groups) {
    users = users.concat(chooseUsers(key, groups[group], desiredNumber, owner))
  }
  return users
}

export async function fetchConfigurationFile(client: github.GitHub, options) {
  const { owner, repo, path, ref } = options
  const result = await client.repos.getContents({
    owner,
    repo,
    path,
    ref,
  })

  const data: any = result.data

  if (!data.content) {
    throw new Error('the configuration file is not found')
  }

  const configString = Buffer.from(data.content, 'base64').toString()
  const config = yaml.safeLoad(configString)

  return config
}
