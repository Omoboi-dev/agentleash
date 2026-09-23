import React from 'react'

function About() {
    return (
    <div className='w-full my-[40px] md:my-[50px]'>
        <h1 className='text-[32px] md:text-[40px] font-medium leading-[1.1] font-instrument text-center'>Give your AI agent a budget<br/>it cannot break</h1>
        <p className='text-[12px] font-mono text-[#908E8E] text-center mt-4 max-w-[520px] mx-auto'>
          Fund a policy, approve who the agent can pay, cap each payment and each period.
          The limits live in a Clarity contract on Stacks, so they hold even if the agent goes wrong.
          Revoke anytime and the funds come straight back.
        </p>
    </div>
    );
  }

export default About
